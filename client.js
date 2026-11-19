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

// Builds the ordered list of ALL checked labels (regardless of whether count is 0 or higher)
function getEnabledLabelGroups(boardLabels, labelConfig) {
  var config = labelConfig || {};
  var namedLabels = (boardLabels || []).filter(function (l) {
    return l.name && l.name.trim().length > 0;
  });

  var groups = [];
  var groupByPrefix = {};

  namedLabels.forEach(function (label) {
    if (!config[label.id] || !config[label.id].enabled) return;

    var prefix = (config[label.id].prefix || formatLabelPrefix(label.name)).trim();
    var key = prefix.toLowerCase();

    if (!groupByPrefix[key]) {
      groupByPrefix[key] = {
        prefix: prefix,
        color: normalizeBadgeColor(label.color),
        labelIds: []
      };
      groups.push(groupByPrefix[key]);
    }
    groupByPrefix[key].labelIds.push(label.id);
  });

  return groups;
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
      t.get('board', 'shared', 'labelConfig')
    ]).then(function ([currentCard, currentList, board, savedTargets, savedConfig]) {
      var targets = savedTargets || {};

      // Only render on the card explicitly selected for this list
      if (targets[currentList.id] !== currentCard.id) {
        return [];
      }

      var groups = getEnabledLabelGroups(board.labels, savedConfig);

      // Every checked label gets a permanent badge slot that always displays "PREFIX - <count>" (including 0)
      return groups.map(function (group) {
        return {
          dynamic: function () {
            return Promise.all([
              t.list('id'),
              t.cards('id', 'idList', 'labels')
            ]).then(function ([list, allCards]) {
              var count = 0;

              allCards.forEach(function (card) {
                if (card.idList !== list.id) return;
                if (card.id === currentCard.id) return;
                var hasMatch = card.labels.some(function (l) {
                  return group.labelIds.indexOf(l.id) !== -1;
                });
                if (hasMatch) count++;
              });

              return {
                text: group.prefix + ' - ' + count,
                color: group.color,
                refresh: 10
              };
            });
          }
        };
      });
    });
  }
});
