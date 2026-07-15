let io = null;

function init(ioInstance) {
  io = ioInstance;
}

function emitToUser(userId, event, payload) {
  if (io && userId) io.to('user:' + userId).emit(event, payload);
}

module.exports = { init, emitToUser };
