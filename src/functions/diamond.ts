import { config } from "dotenv"
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import { sendDiscordAlert } from "./Discord";

config()

const X_NFT_API_KEY = process.env.API_KEY;

let diamondData: IDiamond = {
  current: 0,
  firstRun: 1,
  lastCount: 0,
  lastUpdateTime: 0,
  hourlyRate: 0,
  dailyRate: 0,
  weeklyRate: 0,
};



export async function getDiamondCount() {
  try {
    const apiUrl = `https://nfttools.pro/magiceden/auth/user/0x22706Aea448e97a8805D17991e36292545Bd30Ba?enableSNS=true`;
    let headers = {
      "X-NFT-API-Key": X_NFT_API_KEY,
      Authorization:
        "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZGRyZXNzIjoiMHgyMjcwNkFlYTQ0OGU5N2E4ODA1RDE3OTkxZTM2MjkyNTQ1QmQzMEJhIiwiaXNzIjoibWFnaWNlZGVuLmlvIiwiaWF0IjoxNzE0MzkyNjYyLCJleHAiOjE3MjIxNjg2NjJ9",
      Cookie:
        "session_ids=%7B%22ids%22%3A%5B%7B%22signature%22%3A%22afIqvr6QpR3NdtJdXI6d-qv-RToMGj3akwYgjGahonI%22%2C%22walletAddress%22%3A%22bc1psa38j966mq2yew7sfyp7c58crmttejhzy9hedsgl4slglfd5wq5q3ytgmg%22%7D%2C%7B%22signature%22%3A%22Zo1J-BrT7KLc6HYk1FVvwp4-x3-D2FBs6D-hz5Jgzf8%22%2C%22walletAddress%22%3A%22bc1ph4cthvtg72lqvrztkz9y7khfahll6pyjlgh7lksvhtzu8gn5qqtqcs0ty7%22%7D%2C%7B%22signature%22%3A%22eYqGTvv2xtHGj1mV8vNjBGd_r5gUwOW_SRBG6wvbU38%22%2C%22walletAddress%22%3A%22bc1p4w334uur7pce35actl5dpm3dt4u97vqzy56ftgcewetcvaj4wk9qe98mdu%22%7D%2C%7B%22signature%22%3A%22OO3R8pogR2sV0zLGCVHM_EhZKOn8ctCJwt6Rxy9Gcoc%22%2C%22walletAddress%22%3A%22bc1pg0zkzgn645qz98dys6h25sdwtmfsneeuawxk63fzz7zsztkp4jyssfgqq5%22%7D%2C%7B%22signature%22%3A%22WLoc-pDiBy9kZj4v04knrcYFRx3b_7CzlhfdbvHuacg%22%2C%22walletAddress%22%3A%220xe61dcC958fc886924f97a1ba7Af2781361f58e7A%22%7D%2C%7B%22signature%22%3A%22payWACufPwQUOMrSnTV3uagNh8VTIwi8YDF_cVYqF34%22%2C%22walletAddress%22%3A%220x46581163dF325d8349C17A749a935df9CDA513E6%22%7D%2C%7B%22signature%22%3A%22tggDV2J8n2-9iHjMW5YnqzSqkTcvXBpLjQb3uLtG810%22%2C%22walletAddress%22%3A%220x22706Aea448e97a8805D17991e36292545Bd30Ba%22%7D%2C%7B%22signature%22%3A%22SUCxpcR-7wfyWI2ZF_Y_opvPQJq7BMuVz-VJi8-6Uz8%22%2C%22walletAddress%22%3A%22bc1pk7yqvx3ewtqn0ycyf8u8ahjgaa8ffzcxwl93c6dalpmxfx0kjj9qj5zqjx%22%7D%2C%7B%22signature%22%3A%22Is0hbRjOhfoUv2wMQEshGR9DGf1NxefdCS-Pj3NvRt4%22%2C%22walletAddress%22%3A%220xCEd86e6c57aD9a65AF5fF46626454F836f86E286%22%7D%5D%7D",
    };
    const response = await limiter.schedule(() =>
      axiosInstance.get(apiUrl, { headers })
    );
    const diamondCount = response.data.diamondCount;
    return diamondCount;
  } catch (error) {
    console.error("Failed to fetch diamond count:", error);
    return null;
  }
};

export async function updateDiamondData() {
  const currentDiamondCount = await getDiamondCount();
  console.log(" ");
  console.log("-------------------------------------------------------");
  console.log(`---------------- DIAMOND COUNT CHECK ------------------`);
  console.log("-------------------------------------------------------");

  console.log("Current diamond count:", currentDiamondCount);

  if (currentDiamondCount !== null) {
    const now = Date.now();

    if (diamondData.firstRun === 1) {
      diamondData.lastUpdateTime = now;
      diamondData.lastCount = currentDiamondCount;
      diamondData.firstRun = 0;
    } else {
      const timeElapsed = (now - diamondData.lastUpdateTime) / 60000; // in minutes
      const diamondIncrease = currentDiamondCount - diamondData.lastCount;

      if (diamondIncrease !== 0) {
        diamondData.lastUpdateTime = now;
        sendDiscordAlert(
          `Diamond increase: ${diamondIncrease.toFixed(1)} diamonds`
        );

        console.log(`Diamond increase: ${diamondIncrease.toFixed(1)} diamonds`);
        console.log(`Time elapsed: ${timeElapsed.toFixed(1)} minutes`);

        const ratePerMinute = diamondIncrease / timeElapsed;

        // Update rates
        diamondData.hourlyRate = ratePerMinute * 60; // seconds in an hour
        diamondData.dailyRate = ratePerMinute * 1440; // seconds in a day
        diamondData.weeklyRate = ratePerMinute * 10080; // seconds in a week
      }
      sendDiscordAlert(
        `Time since last update: ${timeElapsed.toFixed(1)} minutes`
      );
      console.log(`Time since last update: ${timeElapsed.toFixed(1)} minutes`);
      sendDiscordAlert(
        `Projected hourly increase: ${diamondData.hourlyRate.toFixed(
          0
        )} diamonds/hour`
      );
      console.log(
        `Projected hourly increase: ${diamondData.hourlyRate.toFixed(
          0
        )} diamonds/hour`
      );
      console.log(
        `Projected daily increase: ${diamondData.dailyRate.toFixed(
          0
        )} diamonds/day`
      );
      console.log(
        `Projected weekly increase: ${diamondData.weeklyRate.toFixed(
          0
        )} diamonds/week`
      );
    }

    // Update last observed data
    diamondData.lastCount = currentDiamondCount;
    console.log("-------------------------------------------------------");
    console.log(" ");
  }
};


interface IDiamond {
  current: number;
  firstRun: number;
  lastCount: number;
  lastUpdateTime: number;
  hourlyRate: number;
  dailyRate: number;
  weeklyRate: number;
}