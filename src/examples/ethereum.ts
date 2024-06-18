import axios from "axios";
import { config } from "dotenv";
import { FetchCollectionDetailsResponse, FetchEthereumCollectionBidsResponse } from "./ethereum.interface";

config()

const API_KEY = process.env.API_KEY as string;

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}


async function main() {
  try {
    fetchEthereumCollectionBids();
  } catch (error) {
    console.log(error);
  }
}

main()


async function fetchCollectionDetails() {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/collections/v7';
  const params = {
    id: '0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949',
    limit: 1,
    includeSalesCount: true,
    excludeSpam: true,
    displayCurrency: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
  };


  try {
    const { data } = await axios.get<FetchCollectionDetailsResponse>(url, { params, headers });
    console.log(JSON.stringify(data));
  } catch (error: any) {
    console.log(error.response.data);
  }
}


async function fetchCollectionStats() {
  const url = 'https://nfttools.pro/magiceden/collection_stats/stats';
  const params = {
    chain: 'ethereum',
    collectionId: '0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949',
  };

  try {
    const { data } = await axios.get(url, { params, headers });
    console.log(JSON.stringify(data));
    return data
  } catch (error: any) {
    console.error('Error fetching collection stats:', error.response.data);
  }
}


async function fetchEthereumCollectionBids() {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/orders/bids/v6';
  const params = {
    collection: '0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949',
    sortBy: 'price',
    status: 'active',
    excludeEOA: 'false',
    includeCriteriaMetadata: 'true',
    includeDepth: 'true',
    normalizeRoyalties: 'false'
  };


  try {
    const { data } = await axios.get<FetchEthereumCollectionBidsResponse>(url, { params, headers });
    console.log(JSON.stringify(data));
    return data
  } catch (error: any) {
    console.error('Error fetching collection bids:', error.response.data);
  }
}

