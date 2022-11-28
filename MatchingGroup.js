// Input emitter.
let input = require('./input/inputMiddleware');
let ExtError = require('./extError');
let Logger = require('./Logger');

// Callbacks to backend.
let callbacks = require('./callbacks');
let BattleOperations = require('./BattleOperations');
let TimeOperation = require('./TimeOperation');

// Functions for work with global users.
let userCallbacks = require('./user');

module.exports = class MatchingGroup {
  constructor(groupId) {
    this.groupId = groupId;

    let _self = this;

    let proxyHandler = {
      /**
       *
       * @param target
       * @param property
       * @param value
       * @param receiver
       * @returns {boolean}
       */
      set: function(target, property, value, receiver) {
        target[property] = value;

        _self._observeGroup(target, property, value);
        return true;
      }
    };

    this.users = new Proxy([], proxyHandler);
    MatchingGroup.appendGroupToGlobal(this);
  }

  /**
   * Observe matching groups, react to new appended users.
   *
   * @param target
   * @param key
   * @param insertedItem
   * @private
   */
  _observeGroup(target, key, insertedItem) {
    if (Number.isInteger(parseInt(key))) {
      let group = this;
      process.nextTick(function () {
        group.runMatching(insertedItem);
      });
    }
  }

  /**
   * Match with newcomer user.
   *
   * @param currentUser
   * @returns {boolean}
   *  matched or not.
   *
   * @private
   */
  _matchWithNewcomerUser(currentUser) {
    let _self = this;
    let matched = false;

    // Go thru matching groups.
    // Need find users in value.matchingGroupIds, which have current user group(this.groupId) in their matchingGroupIds.
    for (let gid in currentUser.matchingGroupIds) {
      if (!matched) {
        let group = MatchingGroup.getGroup(currentUser.matchingGroupIds[gid]);

        if (!group) {
          return false;
        }

        // We go thru each user in matching group.
        for (let id in group.users) {
          let user = group.users[id];

          // We should not match same user.
          if (user.userId === currentUser.userId) continue;

          // Why backend return us groups from different workspaces?
          if (user.workspaceId !== currentUser.workspaceId) {
            Logger.logDebugMessage('Backend error - groups from different workspaces', {user: user, currentUser: currentUser});
            continue;
          }

          // Check that user in matching group can match current group.
          if (user.matchingGroupIds.includes(this.groupId)) {

            // Check if user already played with other recently.
            if (userCallbacks.searchBattleInHistory(currentUser.userId, user.userId)) {
              // Already played with this player, skip him.
              continue;
            }

            // Remove from group right now. If needed we return users later.
            // And we last time check here if user still in group.
            if (_self.checkIfUserInGroup(user) && _self.checkIfUserInGroup(currentUser)) {
              group.removeUserFromGroup(user.userId); // Remove founded user, without clearing flag.
              _self.removeUserFromGroup(currentUser.userId); // Remove observable user, withoot clearing flag.
              matched = true;

              // Remove time operations, if they present, because if users matched, we don't need match them again.
              TimeOperation.removeTimeOperation('matching', currentUser.userId);
              TimeOperation.removeTimeOperation('matching', user.userId);

              // Log message about success matching.
              Logger.logDebugMessage('MATCHED: User ' + currentUser.userId + '(' + currentUser.userName + ') with user '
              + user.userId + '(' + user.userName + '), AS NEWCOMER USER');

              // we should match - so create battle for two users.
              let params = {
                firstUser : user,
                secondUser : currentUser,
                type : 'default',
              };
              if (user.tournamentId !== undefined) {
                params.tournamentId = user.tournamentId;
              }
              if (user.phaseId !== undefined) {
                params.phaseId = user.phaseId;
              }
              if (user.caseId !== undefined) {
                params.caseId = user.caseId;
              }

              callbacks.createBattle(BattleOperations.joinNewRoomMultiple.bind(null,  [user, currentUser]), params);
            }
          }
        }
      }
    }

    if (_self.checkIfUserInGroup(currentUser)) {
      // If user still in group, than user not matched in current step (newcomer condition).
      // Log message about not success matching.
      Logger.logDebugMessage('NOT MATCHED: User ' + currentUser.userId + '(' + currentUser.userName + ') AS NEWCOMER USER');
      return false;
    }
    else {
      // If user not in group, then it already matched or left group, so should not be matched.
      return  true;
    }
  }

  /**
   * Match with user by time condition.
   *
   * @param currentUser
   * @param timeCondition
   *  Time in seconds.
   * @returns {boolean}
   *  matched or not.
   *
   * @private
   */
  _matchWithUserByTimeCondition(currentUser, timeCondition) {
    let _self = this;
    let matched = false;

    // Go thru matching groups.
    // Need find users in value.matchingGroupIds, which have current user group(this.groupId) in their matchingGroupIds.
    for (let gid in currentUser.matchingGroupIds) {
      if (!matched) {
        let group = MatchingGroup.getGroup(currentUser.matchingGroupIds[gid]);

        if (!group) {
          return false;
        }

        // We go thru each user in matching group.
        for (let id in group.users) {
          let user = group.users[id];

          // We should not match same user.
          if (user.userId === currentUser.userId) continue;

          // Why backend return us groups from different workspaces?
          if (user.workspaceId !== currentUser.workspaceId) {
            Logger.logDebugMessage('Backend error - groups from different workspaces', {user: user, currentUser: currentUser});
            continue;
          }

          // Check that user in matching group can match current group.
          if (user.matchingGroupIds.includes(this.groupId)) {

            let isLastTimeConditionValid = true;
            if (timeCondition) {
              // Get last played time in milliseconds.
              let lastPlayedTime = userCallbacks.searchBattleInHistory(currentUser.userId, user.userId);
              if (lastPlayedTime) {
                isLastTimeConditionValid = parseInt((Date.now() - lastPlayedTime)/1000) >= timeCondition;
              }
            }

            if (isLastTimeConditionValid) {

              // Remove from group right now. If needed we return users later.
              // And we last time check here if user still in group.
              if (_self.checkIfUserInGroup(currentUser) && _self.checkIfUserInGroup(user)) {
                group.removeUserFromGroup(user.userId); // Remove founded user, without clearing flag.
                _self.removeUserFromGroup(currentUser.userId); // Remove observable user, withoot clearing flag.
                matched = true;

                // Remove time operations, if they present, because if users matched, we don't need match them again.
                TimeOperation.removeTimeOperation('matching', currentUser.userId);
                TimeOperation.removeTimeOperation('matching', user.userId);

                // Log message about success matching.
                Logger.logDebugMessage('MATCHED: User ' + currentUser.userId + '(' + currentUser.userName + ') with user '
                  + user.userId + '(' + user.userName + '), AS TIME CONDITION USER');

                // we should match - so create battle for two users.
                let params = {
                  firstUser : user,
                  secondUser : currentUser,
                  type : 'default',
                };
                if (user.tournamentId !== undefined) {
                  params.tournamentId = user.tournamentId;
                }
                if (user.phaseId !== undefined) {
                  params.phaseId = user.phaseId;
                }
                if (user.caseId !== undefined) {
                  params.caseId = user.caseId;
                }

                callbacks.createBattle(BattleOperations.joinNewRoomMultiple.bind(null, [user, currentUser]), params);
              }
            }
            else {
              // Not played with this user, or played too recently, so skip.
            }
          }
        }
      }
    }


    if (_self.checkIfUserInGroup(currentUser)) {
      // If user still in group, than user not matched in current step (newcomer condition).
      // Log message about not success matching.
      Logger.logDebugMessage('NOT MATCHED: User ' + currentUser.userId + '(' + currentUser.userName + ') AS TIME CONDITION USER');
      return false;
    }
    else {
      // If user not in group, then it already matched or left group, so should not be matched.
      return  true;
    }
  }

  /**
   * Append user to group.
   *
   * @param user
   */
  appendUserToGroup(user) {
    try {
      let find = this.users.some((value) => {
        return value.userId === user.userId;
      });

      if (find) {
        throw new ExtError('01508', 'client_error', "Can't append to queue, because already in queue now", {groupId : this.groupId, socketId : userCallbacks.getActiveUserSocket(user.userId)});
      }
      else {
        user.groupId = this.groupId;
        this.users.push(user);
      }
    }
    catch (error) {
      if (error.name !== 'ExtError') {
        error.context = user;
      }
      ExtError.handleErrors(error);
    }
  }

  /**
   * Append user to group.
   *
   * @param user
   */
  checkIfUserInGroup(user) {
    return this.users.some((value) => {
      return value.userId === user.userId;
    });
  }

  /**
   * Remove user from group.
   *
   * @param userId
   */
  removeUserFromGroup(userId) {
    for (let index in this.users) {
      if (this.users[index].userId === userId) {
        this.users.splice(index, 1);
      }
    }
  }

  /**
   * Remove group.
   */
  remove() {
    MatchingGroup.deleteFromGlobalGroups(this.groupId);
  }

  /**
   * Match user (find opponents).
   *
   * @param currentUser
   * @private
   */
  runMatching(currentUser) {
    let _self = this;
    let matched = !currentUser.matchingRules.length
      ? _self._matchWithUserByTimeCondition(currentUser, 0)
      : false;

    // Go thru matching rules.
    for (let rid in currentUser.matchingRules) {
      if (!matched) {
        if (currentUser.matchingRules[rid].id === "unique_opponent") {
          matched = _self._matchWithNewcomerUser(currentUser);
        }
        else if (currentUser.matchingRules[rid].id === "last_battle_time") {
          matched = _self._matchWithUserByTimeCondition(currentUser, currentUser.matchingRules[rid].time);
        }
        else {
          matched = _self._matchWithUserByTimeCondition(currentUser, 0);
        }
      }
    }

    if (!matched) {
      // Need set time operation to observe him later.

      // Go thru matching rules again to find minimum time.
      for (let rid in currentUser.matchingRules) {
        if (currentUser.matchingRules[rid].id === "last_battle_time") {


          let time = currentUser.matchingRules[rid].time;
          // Calculate event date.
          // Time operation to change status in event date.
          // Calculate event date.
          let eventDate = new Date(Date.now() + time*1000);

          // Log message about success matching.
          Logger.logDebugMessage('SET TIME EVENT FOR MATCHING: User ' + currentUser.userId + '(' + currentUser.userName + ') should be matched in '
            + time + ' seconds: ' + eventDate);

          // Time operation to run matching for user in event date.
          let runMatchingOp = new TimeOperation(
            'matching',
            currentUser.userId,
            eventDate,
            {currentUser : currentUser, currentUserGroupId: _self.groupId}
          );
          // Remove same time operation, if exist.
          TimeOperation.removeTimeOperation('matching', currentUser.userId);
          TimeOperation.addTimeOperationToGlobal(runMatchingOp);
          return; // Break;
        }
      }
    }
  }

  /**
   * Return group by groupId.
   *
   * @param groupId
   *
   * @returns boolean|Object MatchingGroup
   */
  static getGroup(groupId) {
    if (allGroups[groupId] !== undefined) {

      return allGroups[groupId];
    }
    else {
      return false;
    }
  }

  /**
   * Append group to global list.
   * @param group
   */
  static appendGroupToGlobal(group) {
    if (allGroups[group.groupId] === undefined) {
      allGroups[group.groupId] = group;
    }
  }

  /**
   * Remove group from global allGroups.
   *
   * @param groupId
   */
  static deleteFromGlobalGroups(groupId) {
    delete allGroups[groupId];
  }

};
