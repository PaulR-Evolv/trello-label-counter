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

// Returns ONLY enabled labels with count > 0 in consistent board-label order
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

      // Render ONLY active non-zero badges (zero empty pills or leading spacers)
      var result = currentBadges.map(function (b) {
        return {
          text: b.text,
          color: b.color
        };
      });

      // Single trailing watcher triggers a full clean rebuild whenever any count changes
      result.push({
        dynamic: function () {
          return Promise.all([
            t.list('id'),
            t.board('labels'),
            t.get('board', 'shared', 'targetCards'),
            t.get('board', 'shared', 'labelConfig'),
            t.cards('id', 'idList', 'labels')
          ]).then(function ([list, liveBoard, liveTargets, liveConfig, liveCards]) {
            var latestBadges = getActiveBadges(
              list.id,
              currentCard.id,
              liveBoard.labels,
              liveTargets,
              liveConfig,
              liveCards
            );
            var latestSignature = serializeBadges(latestBadges);

            if (latestSignature !== renderedSignature) {
              var now = Date.now();
              if (!lastWriteTimestamp[currentCard.id] || now - lastWriteTimestamp[currentCard.id] > 3000) {
                lastWriteTimestamp[currentCard.id] = now;
                t.set('card', 'shared', 'counterState', latestSignature);
              }
            }

            return { refresh: 10 };
          });
        }
      });

      return result;
    });
  }
});
