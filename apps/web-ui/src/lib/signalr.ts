/* eslint-disable no-restricted-globals */
import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";

// ฟังก์ชันสร้าง HubConnection สำหรับ /hubs/jobs โดยแนบ JWT ทุกครั้ง
export const createJobHubConnection = (): HubConnection => {
  const tokenFactory = () => localStorage.getItem("jwt") ?? "";
  return new HubConnectionBuilder()
    .withUrl(`${process.env.NEXT_PUBLIC_API_URL}/hubs/jobs`, {
      accessTokenFactory: tokenFactory,
    })
    .withAutomaticReconnect()
    .build();
}; 