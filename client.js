/* global TrelloPowerUp */

var TRELLO_DEFAULT_ICON = 'https://p.trellocdn.com/apple-touch-icon-152x152-precomposed.png';
var lastWriteTimestamp = {};

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

// Returns ONLY enabled labels with count > 0 in exact board-label order
function getActiveBadges(listId, currentCardId, boardLabels, targetCards, labelConfig, allCards) {
  var targets = targetCards || {};
  if (targets[listId] !== currentCardId) {
    return [];
  }

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

  var badges = [];
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
      badges.push({
        text: group.prefix + ' - ' + count,
        color: group.color
      });
    }
  });

  return badges;
}

function serializeBadges(badges) {
  return badges.map(function (b) {
    return b.text + ':' + b.color;
  }).join('|');
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
      t.get('board', 'shared', 'targetCards'),
      t.get('board', 'shared', 'labelConfig'),
      t.cards('id', 'idList', 'labels')
    ]).then(function ([currentCard, currentList, board, savedTargets, savedConfig, allCards]) {
      var targets = savedTargets || {};
      var isTopCard = currentList.cards && currentList.cards.length > 0 && currentList.cards[0].id === currentCard.id;
      var isExplicitTarget = targets[currentList.id] === currentCard.id;

      if (!isTopCard && !isExplicitTarget) {
        return [];
      }

      var currentBadges = getActiveBadges(
        currentList.id,
        currentCard.id,
        board.labels,
        targets,
        savedConfig,
        allCards
      );

      var renderedSignature = serializeBadges(currentBadges);

      function triggerRebuildIfChanged(latestSignature) {
        if (latestSignature !== renderedSignature) {
          var now = Date.now();
          if (!lastWriteTimestamp[currentCard.id] || now - lastWriteTimestamp[currentCard.id] > 2500) {
            lastWriteTimestamp[currentCard.id] = now;
            t.set('card', 'shared', 'counterState', latestSignature);
          }
        }
      }

      // If no matching cards are in the list yet, keep 1 watcher until a labeled card arrives
      if (currentBadges.length === 0) {
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
                var latestBadges = getActiveBadges(list.id, currentCard.id, liveBoard.labels, liveTargets, liveConfig, liveCards);
                triggerRebuildIfChanged(serializeBadges(latestBadges));
                return { refresh: 10 };
              });
            }
          }
        ];
      }

      // Attach the 10-second poller to the FIRST real badge so zero extra empty slots exist
      return currentBadges.map(function (badge, index) {
        if (index === 0) {
          return {
            dynamic: function () {
              return Promise.all([
                t.list('id'),
                t.board('labels'),
                t.get('board', 'shared', 'targetCards'),
                t.get('board', 'shared', 'labelConfig'),
                t.cards('id', 'idList', 'labels')
              ]).then(function ([list, liveBoard, liveTargets, liveConfig, liveCards]) {
                var latestBadges = getActiveBadges(list.id, currentCard.id, liveBoard.labels, liveTargets, liveConfig, liveCards);
                triggerRebuildIfChanged(serializeBadges(latestBadges));

                if (!latestBadges[0]) {
                  return { text: '', refresh: 10 };
                }
                return {
                  text: latestBadges[0].text,
                  color: latestBadges[0].color,
                  refresh: 10
                };
              });
            }
          };
        }

        return {
          text: badge.text,
          color: badge.color
        };
      });
    });
  }
});
