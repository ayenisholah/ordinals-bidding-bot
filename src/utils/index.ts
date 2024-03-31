import Bottleneck from "bottleneck"

import axiosInstance from "../axios/axiosInstance";

const limiter = new Bottleneck({
  minTime: 250,
});

export async function getBitcoinBalance(address: string) {
  try {
    const response = await limiter.schedule(() =>
      axiosInstance.get(`https://blockchain.info/rawaddr/${address}`));
    const balance = response.data.final_balance;
    console.log('--------------------------------------------------------------------------------');
    console.log("BALANCE: ", balance);
    console.log('--------------------------------------------------------------------------------');

    return balance;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}