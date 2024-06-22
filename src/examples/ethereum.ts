import axios from "axios";
import { config } from "dotenv";
import { CreateOrderData, EthereumActivityResponse, EthereumTokenResponse, EthereumUserCollection, FetchCollectionDetailsResponse, FetchEthereumCollectionBidsResponse, NFTData, OfferResponse, UserAuthData } from "./ethereum.interface";
import axiosInstance from "../axios/axiosInstance";
import { Wallet, ethers } from "ethers";

config()

const API_KEY = process.env.API_KEY as string;

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}


async function main() {
  try {
    fetchUserTokens();
  } catch (error) {
    console.log(error);
  }
}

main()

export async function listOnMagicEden(walletAddress: string, contract: string, tokenId: string | number, listingPrice: number, wallet: ethers.Wallet) {
  const listEndpoint =
    "https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/list/v5";
  const signEndpoint =
    "https://nfttools.pro/magiceden/v3/rtp/ethereum/order/v4";

  const weiPrice = (listingPrice * 1e18).toString()

  const duration = 15 //mins

  const expirationTime = (
    Math.floor(Date.now() / 1000) + 60 * duration
  ).toString()

  try {
    const listResponse = await
      axiosInstance.post(
        listEndpoint,
        {
          maker: walletAddress,
          source: "magiceden.io",
          params: [
            {
              token: `${contract}:${tokenId}`,
              weiPrice: weiPrice,
              orderbook: "reservoir",
              orderKind: "payment-processor-v2",
              quantity: 1,
              currency: "0x0000000000000000000000000000000000000000",
              expirationTime: expirationTime,
              automatedRoyalties: false,
              options: {
                "payment-processor-v2": { useOffChainCancellation: true },
              },
            },
          ],
        },
        { headers }
      )

    const signData = listResponse.data.steps.find(
      (step: any) => step.id === "order-signature"
    ).items[0].data.sign;

    const signature = await wallet._signTypedData(
      signData.domain,
      signData.types,
      signData.value
    );

    const { seller, ...restOfSignData } = signData.value;

    const order = {
      items: [
        {
          order: {
            kind: "payment-processor-v2",
            data: {
              kind: "sale-approval",
              sellerOrBuyer: seller,
              ...restOfSignData,
              r: "0x0000000000000000000000000000000000000000000000000000000000000000",
              s: "0x0000000000000000000000000000000000000000000000000000000000000000",
              v: 0,
            },
          },
          orderbook: "reservoir",
        },
      ],
      source: "magiceden.io",
    };

    const finalListingResponse = await
      axiosInstance.post(
        `${signEndpoint}?signature=${encodeURIComponent(signature)}`,
        order,
        { headers }
      )

    console.log("NFT listed successfully:");
    console.log(finalListingResponse.data);
    return finalListingResponse.data;
  } catch (error: any) {
    console.error("Failed to list NFT:", error.response.data);
    return null;
  }
}

export async function bidOnMagicEden(
  maker: string,
  collection: string,
  quantity: number,
  weiPrice: string,
  expirationTime: string,
  privateKey: string,
) {
  const data = {
    maker: maker,
    source: "magiceden.io",
    params: [
      {
        collection: collection,
        currency: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
        quantity: quantity,
        weiPrice: weiPrice,
        expirationTime: expirationTime,
        orderKind: "payment-processor-v2",
        orderbook: "reservoir",
        options: {
          "payment-processor-v2": {
            useOffChainCancellation: true
          }
        },
        automatedRoyalties: true
      }
    ]
  };


  try {
    const { data: order } = await axiosInstance.post<CreateOrderData>('https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/bid/v5', data, {
      headers: headers
    })

    const NETWORK = "mainnet"
    const INFURA_API_KEY = process.env.INFURA_API_KEY
    const provider = new ethers.providers.InfuraProvider(NETWORK, INFURA_API_KEY)
    const wallet = new Wallet(privateKey, provider);


    if (order) {
      const res = await submitSignedOrderData(order, wallet)
      return res
    }
    return order
  } catch (error: any) {
    console.log(error.response.data);

  }
}

export async function submitSignedOrderData(order: CreateOrderData, wallet: ethers.Wallet) {

  const signData: any = order?.steps
    ?.find((step) => step.id === "order-signature")
    ?.items?.[0]?.data?.sign;

  if (signData) {
    const signature = await wallet._signTypedData(
      signData.domain,
      signData?.types,
      signData.value
    );
    const payload = signData.value;
    const { buyer, ...rest } = payload;

    const data = {
      items: [
        {
          order: {
            kind: "payment-processor-v2",
            data: {
              kind: "collection-offer-approval",
              sellerOrBuyer: buyer,
              ...rest,
              r: "0x0000000000000000000000000000000000000000000000000000000000000000",
              s: "0x0000000000000000000000000000000000000000000000000000000000000000",
              v: 0,
            },
          },
          orderbook: "reservoir",
        },
      ],
      source: "magiceden.io",
    };


    const signEndpoint =
      "https://nfttools.pro/magiceden/v3/rtp/ethereum/order/v4";


    try {
      const { data: offerResponse } = await axiosInstance.post<OfferResponse>(`${signEndpoint}?signature=${encodeURIComponent(signature)}`, data, {
        headers
      })

      console.log(JSON.stringify(offerResponse));
      return offerResponse

    } catch (error) {
      console.log(error);
    }
  }
}


async function fetchUserTokens(walletAddress = '0x9adcFFff1DEf95F7E58B587c1A6B06Ac6A7aE1E5') {
  const BASE_URL = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/users/';

  const queryParams = {
    includeLastSale: true,
    excludeSpam: true,
    limit: 50,
    sortBy: 'acquiredAt',
    sortDirection: 'desc',
    onlyListed: false,
    normalizeRoyalties: false
  };

  try {
    const { data } = await axios.get<NFTData>(`https://nfttools.pro/magiceden/v3/rtp/ethereum/users/${walletAddress}/tokens/v10`, {
      params: queryParams, headers
    });
    console.log(JSON.stringify(data));
    return data;
  } catch (error: any) {
    console.error('Error fetching user tokens:', error.response?.data || error.message);
  }
}

async function fetchLoyaltyScore(walletAddress = '0x9adcFFff1DEf95F7E58B587c1A6B06Ac6A7aE1E5', chain = 'ethereum') {
  const BASE_URL = 'https://nfttools.pro/magiceden/rewards/loyalty/score';

  const queryParams = {
    walletAddress: walletAddress,
    chain: chain
  };

  try {
    const { data } = await axios.get(BASE_URL, {
      params: queryParams, headers
    });
    console.log(JSON.stringify(data));
    return data;
  } catch (error: any) {
    console.error('Error fetching loyalty score:', error.response?.data || error.message);
  }
}

async function fetchUserAuthData(wallet = '0x9adcFFff1DEf95F7E58B587c1A6B06Ac6A7aE1E5') {
  const BASE_URL = `https://nfttools.pro/magiceden/auth/user/${wallet}`;

  const queryParams = {
    enableSNS: true
  };

  try {
    const { data } = await axios.get<UserAuthData>(BASE_URL, {
      params: queryParams, headers
    });
    console.log(JSON.stringify(data));

    return data;
  } catch (error: any) {
    console.error('Error fetching user auth data:', error.response?.data || error.message);
  }
}



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


async function fetchEthereumCollectionActivity() {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/collections/activity/v6';
  const params = {
    collection: '0x306b1ea3ecdf94ab739f1910bbda052ed4a9f949',
    types: ['sale', 'ask', 'bid', 'transfer', 'mint']
  };

  try {
    const { data } = await axios.get<EthereumActivityResponse>(url, { params, headers });
    console.log(JSON.stringify(data));
    return data;
  } catch (error: any) {
    console.error('Error fetching collection activity:', error.response?.data || error.message);
  }
}

async function fetchEthereumUserCollections(address = '0x9adcFFff1DEf95F7E58B587c1A6B06Ac6A7aE1E5', collection = '0x07ce82f414a42d9a73b0bd9ec23c249d446a0109') {
  const url = `https://nfttools.pro/magiceden/v3/rtp/ethereum/users/${address}/collections/v4`;
  const params = {
    offset: 0,
    limit: 1,
    collection: collection
  };

  try {
    const { data } = await axios.get<EthereumUserCollection>(url, { params, headers });
    console.log(JSON.stringify(data));
    return data;
  } catch (error: any) {
    console.error('Error fetching user collections:', error.response?.data || error.message);
  }
}


async function fetchEthereumTokens(collection = '0xeeeeeece1b4d9c1bd876b3e7fbe1871947c705cd') {
  const BASE_URL = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/tokens/v7';

  const queryParams = {
    includeQuantity: true,
    includeLastSale: true,
    excludeSpam: true,
    excludeBurnt: true,
    collection: collection,
    sortBy: 'floorAskPrice',
    sortDirection: 'asc',
    limit: 50,
    includeAttributes: false,
    normalizeRoyalties: false
  };

  try {
    const { data } = await axios.get<EthereumTokenResponse>(BASE_URL, { params: queryParams, headers });
    console.log(JSON.stringify(data));
    return data;

  } catch (error: any) {
    console.error('Error fetching Ethereum tokens:', error.response?.data || error.message);
  }
}