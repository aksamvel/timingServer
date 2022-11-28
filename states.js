const roomState = {
  NEW : 'new', // Перед тем как становишься игроком.
  WAITING_USERS : 'waiting', // Ожидание игроков.
  TOSS : 'toss', // Жеребеьвка.
  ROUND : 'round', // Идёт раунд
  ROUND_FIRST : 'round_1', // Идёт раунд
  BREAK : 'break', // Перерыв
  ROUND_SECOND : 'round_2', // Идёт раунд 2
  ASSESMENT : 'assessment', // Оценка компетенций
  SELF_REFEREEING : 'self_refereeing', // Само-судейство
  AS_AND_SR: 'as_and_sr', // Оценка компетенций
  COMPLETED : 'completed', // Бой окончен
  COMPLETED_WAITING_JUDGEMENT : 'completed_waiting_judgement', // Бой окончен, ожидаем решения ЗНС
  CANCELLED : 'cancelled', // Бой отменен
  ERROR : 'error', // Бой окончен
};

const userState = {
  ACTIVE : 'active',
  DISCONNECTED : 'disconnected',
};

const notifications = {
  START_ROUND : 'start_round',
  MY_STEP : 'my_step',
  OTHER_PLAYER_STEP : 'other_player_step',
  USER_DISCONNECTED : 'user_disconnected',
};

function ifStateExist(state) {
  for (let key in roomState) {
    if (roomState[key] === state) {
      return true;
    }
  }
  return false;
}

module.exports = {
  roomState,
  userState,
  notifications,
  ifStateExist,
};