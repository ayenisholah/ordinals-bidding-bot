import axios from "axios";
import { configDotenv } from "dotenv";

configDotenv()

const API_KEY = process.env.API_KEY as string;
const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}

async function main() {
  try {
    await getCollections()
  } catch (error) {
    console.log(error);
  }
}

async function getCollections() {
  try {


    const baseURL = "https://nfttools.pro/ospro/collections"
    const queryParams = {
      offset: 0,
      limit: 50,
      'fields[createdDate]': 1,
      'fields[createdAt]': 1,
      'fields[name]': 1,
      'fields[address]': 1,
      'fields[addresses]': 1,
      'fields[imageUrl]': 1,
      'fields[isVerified]': 1,
      'fields[slug]': 1,
      'fields[stats.floor_price]': 1,
      'fields[stats.items_listed]': 1,
      'fields[stats.num_owners]': 1,
      'fields[stats.total_supply]': 1,
      'fields[stats.one_day_change]': 1,
      'fields[stats.one_day_difference]': 1,
      'fields[stats.one_day_sales]': 1,
      'fields[stats.one_day_sales_change]': 1,
      'fields[stats.one_day_volume]': 1,
      'fields[stats.rolling_one_day_change]': 1,
      'fields[stats.rolling_one_day_sales]': 1,
      'fields[stats.rolling_one_day_sales_change]': 1,
      'fields[stats.rolling_one_day_volume]': 1,
      'fields[stats.top_offer_price]': 1,
      'fields[stats.floor_price_token_price]': 1,
      'fields[stats.floor_price_token_address]': 1,
      'fields[stats.floor_price_token_decimals]': 1,
      'fields[stats.floor_price_token_symbol]': 1,
      'fields[chainName]': 1,
      'fields[stats.floor_price_1d]': 1,
      'sort[stats.rolling_one_day_volume]': -1,
      'filters[chainNames][]': 'ethereum',
      'filters[trending.top_one_day]': true,
    };

    const queryString = new URLSearchParams(JSON.stringify(queryParams)).toString();

    const url = 'https://nfttools.pro/ospro/collections/collections%2Fmocaverse%2Fsales?duration=24_hours&threshold=5000';

    console.log(url);

    const { data } = await axios.get(url, { headers })

    console.log(JSON.stringify(data));

    return data

  } catch (error: any) {
    console.log(error.response.data.issues);
  }
}




main()

function toQueryString(obj: any) {
  const parts = [];
  for (let key in obj) {
    if (obj.hasOwnProperty(key)) {
      let value = obj[key];
      if (typeof value === 'object' && !Array.isArray(value)) {
        value = JSON.stringify(value);
      } else if (Array.isArray(value)) {
        value.forEach(v => {
          parts.push(`${key}[]=${encodeURIComponent(v)}`);
        });
        continue;
      }
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
};
