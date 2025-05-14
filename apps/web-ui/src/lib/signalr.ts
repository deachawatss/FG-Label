/* eslint-disable no-restricted-globals */
import { HubConnection, HubConnectionBuilder } from "@microsoft/signalr";

// ฟังก์ชันสร้าง HubConnection สำหรับ /hubs/job โดยแนบ token ทุกครั้ง
export const createJobHubConnection = (): HubConnection => {
  const tokenFactory = () => localStorage.getItem("token") ?? "";
  return new HubConnectionBuilder()
    .withUrl(`${process.env.NEXT_PUBLIC_SIGNALR_URL}`, {
      accessTokenFactory: tokenFactory,
    })
    .withAutomaticReconnect()
    .build();
}; 