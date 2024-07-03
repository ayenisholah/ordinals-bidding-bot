import axios from "axios";
import { config } from "dotenv";
import { Wallet, providers } from "ethers";

config()
const API_KEY = process.env.API_KEY as string;

const private_key = "6535b5027b37c831065de815fa5d437c3e89add48d70807752eb2413c55d479e"
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY as string;
const rpcURL = `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY}`
const provider = new providers.StaticJsonRpcProvider({
  url: rpcURL,
  timeout: 300000
});
const wallet = new Wallet(private_key, provider);

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}

async function main() {
  try {
    await submitOrder()
  } catch (error) {
    console.log(error);
  }
}

main()

async function submitSignedOffer() {
  try {
    const data = await executeBid()

    const signData: any = data?.steps
      ?.find((step: any) => step.id === "order-signature")
      ?.items?.[0]?.data?.sign;

    const signature = await wallet._signTypedData(
      signData.domain,
      signData?.types,
      signData.value
    );

    console.log(JSON.stringify(signature));

    const payload = signData.value;
    const { buyer, ...rest } = payload;


    const body = {
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

    console.log(JSON.stringify(body));

    const { data: offerResponse } = await axios.post(`https://nfttools.pro/magiceden/v3/rtp/ethereum/order/v4?signature=${encodeURIComponent(signature)}`, body, {
      headers
    })

    console.log(JSON.stringify(offerResponse));
    return offerResponse
  } catch (error: any) {
    console.log(error.response.data.results);
  }
}

async function executeBid() {
  const body = {
    "maker": "0xb71425024868e0c9156c3942AC115Cd3b56d5559",
    "source": "magiceden.io",
    "params": [
      {
        "collection": "0x00b5f2e672f6b8a176bf6ade71238b61360a29e9", "currency": "0x4200000000000000000000000000000000000006", "quantity": 1,
        "weiPrice": "100000000000000",
        "expirationTime": "1722607020",
        "orderKind": "payment-processor-v2",
        "orderbook": "reservoir",
        "options": {
          "payment-processor-v2":
          {
            "useOffChainCancellation": true
          }
        }, "automatedRoyalties": true
      }]
  }
  try {
    const { data } = await axios.post(
      'https://nfttools.pro/magiceden/v3/rtp/base/execute/bid/v5',
      body,
      { headers }
    )
    return data

  } catch (error) {
    console.log(error);
  }
}



async function submitOrder() {
  try {

    const data = await executeList()
    const signData = data.steps.find(
      (step: any) => step.id === "order-signature"
    ).items[0].data.sign;

    const signature = await wallet._signTypedData(
      signData.domain,
      signData.types,
      signData.value
    );

    console.log(JSON.stringify(signature));

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

    console.log(JSON.stringify(order));

    const { data: finalListingResponse } = await
      axios.post(
        `https://nfttools.pro/magiceden/v3/rtp/base/order/v4?signature=${encodeURIComponent(signature)}`,
        order,
        { headers }
      )

    console.log(JSON.stringify(finalListingResponse));

  } catch (error) {
    console.log(error);
  }
}

async function executeList() {
  try {
    const body = {
      "maker": "0xb71425024868e0c9156c3942AC115Cd3b56d5559",
      "source": "magiceden.io",
      "params": [
        {
          "token": "0x9db39ac416c5ec75c2c3ae622d2013ecccc2d74a:9310",
          "weiPrice": "10000000000000",
          "orderbook": "reservoir",
          "orderKind": "payment-processor-v2",
          "quantity": 1, "currency": "0x0000000000000000000000000000000000000000",
          "expirationTime": "1722598814",
          "automatedRoyalties": true,
          "options": {
            "payment-processor-v2":
            {
              "useOffChainCancellation": true
            }
          }
        }
      ]
    }
    const { data } = await axios.post('https://nfttools.pro/magiceden/v3/rtp/base/execute/list/v5', body, { headers })

    return data

  } catch (error) {
    console.log(error);
  }
}


async function getMarketplaceConfiguration() {
  try {
    const { data } = await axios.get('https://nfttools.pro/magiceden/v3/rtp/base/collections/0x9db39ac416c5ec75c2c3ae622d2013ecccc2d74a/marketplace-configurations/v2', { headers })

    console.log(JSON.stringify(data));

    return data

  } catch (error) {
    console.log(error);
  }
}

async function getCollectionSets() {
  try {
    const body = { "collections": ["0x9db39ac416c5ec75c2c3ae622d2013ecccc2d74a"] }
    const { data } = await axios.post('https://nfttools.pro/magiceden/v3/rtp/base/collections-sets/v1',
      body,
      { headers }
    )

    console.log(JSON.stringify(data));

    return data

  } catch (error) {
    console.log(error);
  }
}



async function fetchCollectionStats() {
  const url = 'https://nfttools.pro/magiceden/collection_stats/search/base';
  const params = {
    window: '1d',
    limit: 50,
    sort: 'volume',
    direction: 'desc',
    filter: '{}'
  };

  try {
    const { data } = await axios.get(url, { params, headers });
    console.log(JSON.stringify(data));
  } catch (error: any) {
    console.error('Error fetching collection stats:', error.response.data);
  }
}

async function getMagicEdenCollectionDetails() {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/base/collections/v7';
  const params = {
    id: '0x5ca0c41a50fcfec85b91bb4ca5b024b36d9bb120',
    limit: 1,
    includeSalesCount: true,
    excludeSpam: true,
    displayCurrency: '0x4200000000000000000000000000000000000006',
    normalizeRoyalties: false,
    includeQuantity: true,
    includeLastSale: true,
    excludeBurnt: true,
    sortBy: 'floorAskPrice',
    sortDirection: 'desc',
    includeAttributes: false,
    continuation: null
  };

  try {
    const { data } = await axios.get(url, { params, headers });
    console.log(JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('Error fetching collection details:', error);
    throw error;
  }
}

async function getMagicEdenCollectionAttributes() {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/base/collections/0x5ca0c41a50fcfec85b91bb4ca5b024b36d9bb120/attributes/all/v4';

  try {
    const { data } = await axios.get(url, { headers });
    console.log(JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('Error fetching collection attributes:', error);
    throw error;
  }
}

async function getMagicEdenUserCollectionDetails() {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/base/users/0xb71425024868e0c9156c3942AC115Cd3b56d5559/collections/v4';
  const params = {
    offset: 0,
    limit: 1,
    collection: '0x9db39ac416c5ec75c2c3ae622d2013ecccc2d74a'
  };

  try {
    const { data } = await axios.get(url, { params, headers });
    console.log(JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('Error fetching user collection details:', error);
    throw error;
  }
}

async function fetchMagicEdenBids() {
  const baseUrl = 'https://nfttools.pro/magiceden/v3/rtp/base/orders/bids/v6';

  const params = {
    collection: '0x5ca0c41a50fcfec85b91bb4ca5b024b36d9bb120',
    sortBy: 'price',
    status: 'active',
    excludeEOA: false,
    includeCriteriaMetadata: true,
    includeDepth: true,
    normalizeRoyalties: false
  };

  try {
    const { data } = await axios.get(baseUrl, { params, headers });
    console.log(JSON.stringify(data));
    return data;
  } catch (error) {
    console.error('Error fetching Magic Eden bids:', error);
    throw error;
  }
}

async function baseTokenBids() {
  const baseUrl = 'https://nfttools.pro/magiceden/v3/rtp/base/tokens/v7';

  const params = {
    tokens: '0x9db39ac416c5ec75c2c3ae622d2013ecccc2d74a:9310',
    limit: 1,
    excludeSpam: true,
    includeTopBid: true,
    includeAttributes: true,
    includeQuantity: true,
    includeLastSale: true,
    normalizeRoyalties: false
  };


  try {
    const { data } = await axios.get(baseUrl, { params, headers });
    console.log(JSON.stringify(data));

    return data;
  } catch (error) {
    console.error('Error fetching Magic Eden Ethereum token data:', error);
    throw error;
  }
}

async function fetchMagicEdenEthereumAskOrders() {
  const baseUrl = 'https://nfttools.pro/magiceden/v3/rtp/base/orders/asks/v5';

  const params = {
    token: '0xcb28749c24af4797808364d71d71539bc01e76d4:4865',
    status: 'active',
    sortBy: 'price',
    excludeEOA: false,
    limit: 100,
    normalizeRoyalties: false
  };


  try {
    const { data } = await axios.get(baseUrl, { params, headers });
    console.log(JSON.stringify(data));
    return data
  } catch (error) {
    console.error('Error fetching Magic Eden Ethereum ask orders:', error);
    throw error;
  }
}

async function getTokenActivities() {
  try {
    const baseUrl = 'https://nfttools.pro/magiceden/v3/rtp/base/tokens/0x9db39ac416c5ec75c2c3ae622d2013ecccc2d74a:9310/activity/v5'
    const params = {
      types: ['sale', 'ask', 'transfer', 'mint', 'bid', 'bid_cancel', 'ask_cancel'],
      sortBy: 'eventTimestamp'
    }
    const { data } = await axios.get(baseUrl, { params, headers });
    console.log(JSON.stringify(data));
    return data
  } catch (error) {
    console.log(error);
  }
}


async function baseUser() {
  try {

    const baseUrl = 'https://nfttools.pro/magiceden/v3/rtp/base/users/0xb71425024868e0c9156c3942AC115Cd3b56d5559/tokens/v10'

    const params = {
      includeLastSale: true,
      excludeSpam: true,
      limit: 50,
      sortBy: 'acquiredAt',
      sortDirection: 'desc',
      onlyListed: false,
      normalizeRoyalties: false
    }
    const { data } = await axios.get(baseUrl, { params, headers });
    console.log(JSON.stringify(data));
    return data
  } catch (error) {
    console.log(error);
  }
}

