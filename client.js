/* global TrelloPowerUp */

var TRELLO_DEFAULT_ICON = 'https://p.trellocdn.com/apple-touch-icon-152x152-precomposed.png';
var lastSyncByCard = {};

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

// Computes ONLY the enabled, non-zero badges for a given list
function computeVisibleBadges(listId, currentCardId, boardLabels, labelConfig, allCards) {
  var config = labelConfig || {};
  var namedLabels = (boardLabels || []).filter(function (l) {
    return l.name && l.name.trim().length > 0;
  });

  // Group enabled labels by normalized prefix to prevent duplicates
  var groups = [];
  var groupByPrefix = {};

  namedLabels.forEach(function (label) {
    if (!config[label.id] || !config[label.id].enabled) return;

    var prefix = (config[label.id].prefix || formatLabelPrefix(label.name)).trim();
    var key = prefix.toLowerCase();

    if (!groupByPrefix[key]) {
      groupByPrefix[key] = {
        id: label.id,
        prefix: prefix,
        color: label.color,
        labelIds: []
      };
      groups.push(groupByPrefix[key]);
    }
    groupByPrefix[key].labelIds.push(label.id);
  });

  var visible = [];
  groups.forEach(function (group) {
    var count = 0;
    allCards.forEach(function (card) {
      if (card.idList !== listId) return;
      if (card.id === currentCardId) return;
      var hasMatch = card.labels.some(function (l) {
        return group.labelIds.indexOf(l.id) !== -1;
      });
      if (hasMatch) count++;
    });

    if (count > 0) {
      visible.push({
        id: group.id,
        prefix: group.prefix,
        color: group.color,
        count: count
      });
    }
  });

  return visible;
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
      t.list('id'),
      t.board('labels'),
      t.get('board', 'shared', 'targetCards'),
      t.get('board', 'shared', 'labelConfig'),
      t.cards('id', 'idList', 'labels')
    ]).then(function ([currentCard, currentList, board, savedTargets, savedConfig, allCards]) {
      var targets = savedTargets || {};

      // Only render on the card explicitly targeted for this list
      if (targets[currentList.id] !== currentCard.id) {
        return [];
      }

      var initialVisible = computeVisibleBadges(
        currentList.id,
        currentCard.id,
        board.labels,
        savedConfig,
        allCards
      );

      var renderedSignature = initialVisible.map(function (b) { return b.id; }).join(',');

      // If the list currently has 0 matching cards, keep 1 silent watcher so badges appear
      // automatically the moment a labeled card is moved into this list
      if (initialVisible.length === 0) {
        return [
          {
            dynamic: function () {
              return Promise.all([
                t.list('id'),
                t.board('labels'),
                t.get('board', 'shared', 'targetCards'),
                t.get('board', 'shared', 'labelConfig'),
                t.cards('id', 'idList', 'labels')
              ]).then(function ([list, liveBoard, liveTargets, liveConfig, liveCards]) {
                if ((liveTargets || {})[list.id] !== currentCard.id) {
                  return { refresh: 10 };
                }
                var nowVisible = computeVisibleBadges(list.id, currentCard.id, liveBoard.labels, liveConfig, liveCards);
                var newSig = nowVisible.map(function (b) { return b.id; }).join(',');
                var now = Date.now();
                if (newSig !== '' && (!lastSyncByCard[currentCard.id] || now - lastSyncByCard[currentCard.id] > 3000)) {
                  lastSyncByCard[currentCard.id] = now;
                  t.set('card', 'shared', 'badgeSig', newSig);
                }
                return { refresh: 10 };
              });
            }
          }
        ];
      }

      // Return an array matching the EXACT number of visible badges—zero empty spacer slots
      return initialVisible.map(function (badgeItem, idx) {
        return {
          dynamic: function () {
            return Promise.all([
              t.list('id'),
              t.board('labels'),
              t.get('board', 'shared', 'targetCards'),
              t.get('board', 'shared', 'labelConfig'),
              t.cards('id', 'idList', 'labels')
            ]).then(function ([list, liveBoard, liveTargets, liveConfig, liveCards]) {
              if ((liveTargets || {})[list.id] !== currentCard.id) {
                return { refresh: 10 };
              }

              var nowVisible = computeVisibleBadges(list.id, currentCard.id, liveBoard.labels, liveConfig, liveCards);
              var newSig = nowVisible.map(function (b) { return b.id; }).join(',');

              // If a new label type entered or left the list, trigger a clean array rebuild
              if (idx === 0 && newSig !== renderedSignature) {
                var now = Date.now();
                if (!lastSyncByCard[currentCard.id] || now - lastSyncByCard[currentCard.id] > 3000) {
                  lastSyncByCard[currentCard.id] = now;
                  t.set('card', 'shared', 'badgeSig', newSig);
                }
              }

              var currentBadge = nowVisible.find(function (b) { return b.id === badgeItem.id; });
              if (!currentBadge) {
                return { refresh: 10 };
              }

              return {
                text: currentBadge.prefix + ' - ' + currentBadge.count,
                color: normalizeBadgeColor(currentBadge.color),
                refresh: 10
              };
            });
          }
        };
      });
    });
  }
});
