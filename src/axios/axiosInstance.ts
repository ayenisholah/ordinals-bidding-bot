import axios from "axios";
import axiosRetry from "axios-retry";

const axiosInstance = axios.create({ timeout: 300000 });
axiosRetry(axiosInstance, {
  retries: 3,
  retryDelay: (retryCount, error) => {
    if (error.response && error.response.status === 429) {
      return 60000;
    }
    return axiosRetry.exponentialDelay(retryCount);
  },
  retryCondition: async (error) => {
    if (axiosRetry.isNetworkError(error) || (error.response && error.response.status === 429) || (error.response && error.response.status === 400)) {
      return true
    }
    return false
  }
});

export default axiosInstance;
