import { io } from 'socket.io-client';
import { BACKEND_URL } from './constants';

let socketInstance = null;

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(BACKEND_URL, {
      transports: ['websocket', 'polling']
    });
  }
  return socketInstance;
};
