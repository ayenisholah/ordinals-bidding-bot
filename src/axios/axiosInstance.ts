import axios, { AxiosInstance } from "axios";
import axiosRetry, { IAxiosRetryConfig } from "axios-retry";
import limiter from "../bottleneck";

const axiosInstance: AxiosInstance = axios.create({
  timeout: 300000,
});

const retryConfig: IAxiosRetryConfig = {
  retries: 3,
  retryDelay: (retryCount, error) => {
    limiter.schedule(() => Promise.resolve());
    if (error.response && error.response.status === 429) {
      return 1000;
    }
    return axiosRetry.exponentialDelay(retryCount);
  },
  retryCondition: async (error: any) => {
    if (/have reached the maximum number of offers you can make: 20/i.test(error.response.data.error)) {
      console.log('\x1b[31m%s\x1b[0m', '🛑 MAXIMUM LIMIT REACHED!!! 🛑');
      return false;
    }
    if (/Insufficient funds. Required/i.test(error.response.data.error)) {
      console.log('\x1b[31m%s\x1b[0m', '🛑 INSUFFICIENT FUND TO MAKE BID 🛑');
      return false;
    }
    if (/This offer does not exists. It is either not valid anymore or canceled by the offerer./i.test(error.response.data.error)) {
      console.log('\x1b[31m%s\x1b[0m', '🛑 INVALID OFFER!!! 🛑');
      return false;
    }
    if (
      axiosRetry.isNetworkError(error) || (error.response && error.response.status === 429)) {
      return true;
    }
    if (error.response) {
      const { status, data, config } = error.response;
      console.log(`Request failed for URL: ${config.url}`);
      console.log(`Status Code: ${status}`);
      console.log(`Error Message: ${typeof data === "object" && (data as { message?: string }).message
        ? (data as { message: string }).message
        : "Unknown error"}`);
      if (status === 400) {
        console.log("Bad Request. Please check the request parameters.");
      } else if (status === 401) {
        console.log("Unauthorized. Please check your credentials.");
      } else if (status === 403) {
        console.log("Forbidden. You don't have permission to access this resource.");
      } else if (status === 404) {
        console.log("Not Found. The requested resource could not be found.");
      } else if (status === 500) {
        console.log("Internal Server Error. Please try again later.");
      } else {
        console.log("An unexpected error occurred.");
      }
    } else {
      console.log("An unknown error occurred.");
    }
    return false;
  },
};

axiosRetry(axiosInstance, retryConfig);

export default axiosInstance;