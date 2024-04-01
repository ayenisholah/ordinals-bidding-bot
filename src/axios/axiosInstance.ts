import axios from "axios";
import axiosRetry from "axios-retry";

const axiosInstance = axios.create({ timeout: 300000 });

axiosRetry(axiosInstance, {
  retries: Infinity, // Retry indefinitely
  retryDelay: (retryCount, error) => {
    if (error.response && error.response.status === 429) {
      return 60000;
    }
    return axiosRetry.exponentialDelay(retryCount);
  },
  retryCondition: async (error) => {
    if (
      axiosRetry.isNetworkError(error) ||
      (error.response && error.response.status === 429) ||
      (error.response && error.response.status === 400)
    ) {
      console.log("Retrying..., bad internet connection");
      return true;
    }
    return false;
  },
});

export default axiosInstance;