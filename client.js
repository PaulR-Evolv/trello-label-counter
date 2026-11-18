/* global TrelloPowerUp */

var TRELLO_DEFAULT_ICON = 'https://p.trellocdn.com/apple-touch-icon-152x152-precomposed.png';

function formatLabelPrefix(labelName) {
  if (!labelName) return 'Label';
  return labelName.trim().split(/\s+/)[0];
}

function normalizeBadgeColor(color) {
  if (!color) return 'light-gray';
  var base = color.replace(/_(dark|light)$/, '');
  var allowed = ['blue', 'green', 'orange', 'red', 'yellow', 'purple', 'pink', 'sky', 'lime', 'light-gray'];
  return allowed.indexOf(base) !== -1 ? base : 'light-gray';
}

function openSettingsPopup(t) {
  return t.popup({
    title: 'Label Counter Settings',
    url: './settings.html',
    height: 420
  });
}

window.TrelloPowerUp.initialize({
  'show-settings': openSettingsPopup,

  'card-buttons': function (t) {
    return Promise.all([
      t.card('id', 'idList'),
      t.get('board', 'shared', 'targetCards')
    ]).then(function ([card, savedTargets]) {
      var targetCards = savedTargets || {};
      var isThisCardActive = targetCards[card.idList] === card.id;

      return [
        {
          icon: TRELLO_DEFAULT_ICON,
          text: isThisCardActive ? 'Remove List Label Counter' : 'Set as List Label Counter',
          callback: function (t) {
            if (isThisCardActive) {
              delete targetCards[card.idList];
            } else {
              targetCards[card.idList] = card.id;
            }
            return t.set('board', 'shared', 'targetCards', targetCards).then(function () {
              return t.closePopup();
            });
          }
        },
        {
          icon: TRELLO_DEFAULT_ICON,
          text: 'Configure Lists & Labels',
          callback: openSettingsPopup
        }
      ];
    });
  },

  'card-badges': function (t) {
    return Promise.all([
      t.card('id'),
      t.list('id', 'cards'),
      t.board('labels'),
      t.get('board', 'shared', 'targetCards')
    ]).then(function ([currentCard, currentList, board, savedTargets]) {
      var targetCards = savedTargets || {};
      var isTopCard = currentList.cards && currentList.cards.length > 0 && currentList.cards[0].id === currentCard.id;
      var isExplicitTarget = Object.keys(targetCards).some(function (listId) {
        return targetCards[listId] === currentCard.id;
      });

      if (!isTopCard && !isExplicitTarget) {
        return [];
      }

      // Sort board labels deterministically by ID and lock each badge slot to one fixed label ID
      var fixedLabels = board.labels
        .filter(function (l) { return l.name && l.name.trim().length > 0; })
        .slice()
        .sort(function (a, b) { return a.id.localeCompare(b.id); });

      return fixedLabels.map(function (boundLabel) {
        return {
          dynamic: function () {
            return Promise.all([
              t.list('id'),
              t.board('labels'),
              t.get('board', 'shared', 'targetCards'),
              t.get('board', 'shared', 'labelConfig'),
              t.cards('id', 'idList', 'labels')
            ]).then(function ([list, liveBoard, liveTargets, liveLabels, allCards]) {
              var targets = liveTargets || {};
              var config = liveLabels || {};

              // Explicitly clear badge text if this card is not the active target
              if (targets[list.id] !== currentCard.id) {
                return { text: '', refresh: 10 };
              }

              // Explicitly clear badge text if this specific label is unchecked
              if (!config[boundLabel.id] || !config[boundLabel.id].enabled) {
                return { text: '', refresh: 10 };
              }

              var liveLabelObj = liveBoard.labels.find(function (l) { return l.id === boundLabel.id; }) || boundLabel;
              var prefix = (config[boundLabel.id].prefix || formatLabelPrefix(liveLabelObj.name)).trim();
              var prefixKey = prefix.toLowerCase();

              // Group any enabled labels that share the exact same banner prefix so duplicates never appear
              var sortedAll = liveBoard.labels
                .filter(function (l) { return l.name && l.name.trim().length > 0; })
                .slice()
                .sort(function (a, b) { return a.id.localeCompare(b.id); });

              var samePrefixIds = [];
              sortedAll.forEach(function (l) {
                if (config[l.id] && config[l.id].enabled) {
                  var p = (config[l.id].prefix || formatLabelPrefix(l.name)).trim().toLowerCase();
                  if (p === prefixKey) {
                    samePrefixIds.push(l.id);
                  }
                }
              });

              // Only the primary label ID for this prefix renders the badge; any duplicate stays cleared
              if (samePrefixIds[0] !== boundLabel.id) {
                return { text: '', refresh: 10 };
              }

              var count = 0;
              allCards.forEach(function (card) {
                if (card.idList !== list.id) return;
                if (card.id === currentCard.id) return;
                var matches = card.labels.some(function (l) {
                  return samePrefixIds.indexOf(l.id) !== -1;
                });
                if (matches) count++;
              });

              if (count === 0) {
                return { text: '', refresh: 10 };
              }

              return {
                text: prefix + ' - ' + count,
                color: normalizeBadgeColor(liveLabelObj.color),
                refresh: 10
              };
            });
          }
        };
      });
    });
  }
});
