import axiosInstance from "../axios/axiosInstance";

export async function getBitcoinBalance(address: string) {
  try {
    const response = await axiosInstance.get(`https://blockchain.info/rawaddr/${address}`);
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