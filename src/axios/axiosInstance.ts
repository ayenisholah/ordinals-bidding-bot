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
      return 2000;
    }
    return axiosRetry.exponentialDelay(retryCount);
  },
  retryCondition: async (error: any) => {
    if (/have reached the maximum number of offers you can make: 20/i.test(error.response.data.error)) {
      return false;
    }
    if (/Insufficient funds. Required/i.test(error.response.data.error)) {
      return false;
    }
    if (/This offer does not exists. It is either not valid anymore or canceled by the offerer./i.test(error.response.data.error)) {
      return false;
    }
    if (
      axiosRetry.isNetworkError(error) || (error.response && error.response.status === 429)) {
      return true;
    }
    return false;
  },
};

axiosRetry(axiosInstance, retryConfig);

export default axiosInstance;