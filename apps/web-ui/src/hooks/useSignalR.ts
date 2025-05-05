import { HubConnectionBuilder, HubConnection } from '@microsoft/signalr';
import { useAuth } from '../contexts/AuthContext';

export const useSignalR = () => {
  const { token } = useAuth();

  const createConnection = (hubUrl: string): HubConnection => {
    return new HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token || '',
      })
      .withAutomaticReconnect()
      .build();
  };

  return { createConnection };
}; 