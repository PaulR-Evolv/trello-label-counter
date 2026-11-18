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
    title: 'Tracked Labels Settings',
    url: './settings.html',
    height: 260
  });
}

window.TrelloPowerUp.initialize({
  // 1. Opens the label selection popup from the Power-Up's gear icon
  'show-settings': openSettingsPopup,

  // 2. Card buttons to target a summary card or pick which labels to track
  'card-buttons': function (t) {
    return t.get('card', 'shared', 'isCounterCard').then(function (isCounter) {
      return [
        {
          icon: TRELLO_DEFAULT_ICON,
          text: isCounter ? 'Disable List Label Counter' : 'Set as List Label Counter',
          callback: function (t) {
            return t.set('card', 'shared', 'isCounterCard', !isCounter).then(function () {
              return t.closePopup();
            });
          }
        },
        {
          icon: TRELLO_DEFAULT_ICON,
          text: 'Configure Tracked Labels',
          callback: openSettingsPopup
        }
      ];
    });
  },

  // 3. Live badges displayed ONLY on designated top summary cards
  'card-badges': function (t) {
    return Promise.all([
      t.card('id'),
      t.get('card', 'shared', 'isCounterCard')
    ]).then(function ([currentCard, isCounter]) {
      if (!isCounter) {
        return [];
      }

      return Array.from({ length: MAX_TRACKED_LABELS }, function (_, slotIndex) {
        return {
          dynamic: function () {
            return Promise.all([
              t.list('id'),
              t.board('labels'),
              t.get('board', 'shared', 'labelConfig'),
              t.cards('id', 'idList', 'labels')
            ]).then(function ([currentList, board, labelConfig, allCards]) {
              var config = labelConfig || {};

              var activeLabels = board.labels.filter(function (label) {
                return config[label.id] && config[label.id].enabled;
              });

              var targetLabel = activeLabels[slotIndex];
              if (!targetLabel) {
                return { refresh: 10 };
              }

              var count = 0;
              allCards.forEach(function (card) {
                if (card.idList !== currentList.id) return;
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
