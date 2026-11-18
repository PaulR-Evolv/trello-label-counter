/* global TrelloPowerUp */

var MAX_TRACKED_LABELS = 20;
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
      t.get('board', 'shared', 'targetCards')
    ]).then(function ([currentCard, currentList, savedTargets]) {
      var targetCards = savedTargets || {};
      var isTopCard = currentList.cards && currentList.cards.length > 0 && currentList.cards[0].id === currentCard.id;
      var isExplicitTarget = Object.keys(targetCards).some(function (listId) {
        return targetCards[listId] === currentCard.id;
      });

      // Only initialize polling on top cards or explicitly selected target cards
      if (!isTopCard && !isExplicitTarget) {
        return [];
      }

      return Array.from({ length: MAX_TRACKED_LABELS }, function (_, slotIndex) {
        return {
          dynamic: function () {
            return Promise.all([
              t.list('id'),
              t.board('labels'),
              t.get('board', 'shared', 'targetCards'),
              t.get('board', 'shared', 'labelConfig'),
              t.cards('id', 'idList', 'labels')
            ]).then(function ([list, board, liveTargets, liveLabels, allCards]) {
              var targets = liveTargets || {};
              var config = liveLabels || {};

              // Only display badges if this card is currently selected for this list
              if (targets[list.id] !== currentCard.id) {
                return { refresh: 10 };
              }

              var activeLabels = board.labels.filter(function (label) {
                return config[label.id] && config[label.id].enabled;
              });

              var targetLabel = activeLabels[slotIndex];
              if (!targetLabel) {
                return { refresh: 10 };
              }

              var count = 0;
              allCards.forEach(function (card) {
                if (card.idList !== list.id) return;
                if (card.id === currentCard.id) return;
                if (card.labels.some(function (l) { return l.id === targetLabel.id; })) {
                  count++;
                }
              });

              if (count === 0) {
                return { refresh: 10 };
              }

              var prefix = config[targetLabel.id].prefix || formatLabelPrefix(targetLabel.name);

              return {
                text: prefix + ' - ' + count,
                color: normalizeBadgeColor(targetLabel.color),
                refresh: 10
              };
            });
          }
        };
      });
    });
  }
});
