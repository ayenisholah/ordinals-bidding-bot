import { Contract, ethers, providers, utils, Wallet } from "ethers"
import PQueue from "p-queue"
import { config } from "dotenv"
import limiter from "../bottleneck";
import axiosInstance from "../axios/axiosInstance";
import axios from "axios";
import { CancelRequest } from "../functions/ethereum/interface/cancel.interface";
import { CreateOrderData, OfferResponse, OrdersResponse } from "../functions/ethereum/Bid";
import { WETH_ABI, WETH_ADDRESS } from "../constants/weth";

config()

const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY as string;
const POLL_INTERVAL = 60 * 1000; // 1 minute in milliseconds

export async function getDiamondCount() {
  try {
    const apiUrl = `https://nfttools.pro/magiceden/auth/user/0x22706Aea448e97a8805D17991e36292545Bd30Ba?enableSNS=true`;
    const X_NFT_API_KEY = process.env.API_KEY as string;

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


const startPolling = async () => {
  async function poll() {
    try {
      await updateDiamondData();
    } catch (error) {
      console.error("Error during polling:", error);
    } finally {
      // Wait for the specified polling interval before the next check
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
      poll(); // Call the poll function recursively
    }
  }

  poll(); // Initial call to start the polling process
};

startPolling();

const collections = [
  { slug: "boredapeyachtclub", minProfit: "0.00001", quantity: 1 },
  { slug: "pudgypenguins", minProfit: "0.00001", quantity: 1 },
  { slug: "nouns", minProfit: "0.00001", quantity: 1 },
  { slug: "kizunagenesis", minProfit: "0.00001", quantity: 1 }
]

const slugs = collections.map((item) => item.slug)
const INFURA_API_KEY = process.env.INFURA_API_KEY as string;
const NETWORK = "mainnet"
const provider = new providers.InfuraProvider(NETWORK, INFURA_API_KEY)
const wallet = new Wallet(WALLET_PRIVATE_KEY)
const address = wallet.address
const X_NFT_API_KEY = process.env.API_KEY;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL as string;

const headers = {
  'Content-Type': 'application/json',
  "X-NFT-API-Key": X_NFT_API_KEY,

}




monitorNFTs(slugs, address)
const bidHistory: BidHistory = {}

const RATE_LIMIT = Number(process.env.RATE_LIMIT) ?? 32

const queue = new PQueue({
  concurrency: 1.5 * RATE_LIMIT
});


async function main() {
  while (true) {
    try {
      const gasPrice = await provider.getGasPrice()
      const gasPriceInEther = +ethers.utils.formatEther(gasPrice);
      const acceptOfferAmount = 200000
      const acceptOfferFee = convertEthToWei((gasPriceInEther * acceptOfferAmount).toString())
      const collectionMap = await getCollectionData(slugs)


      await queue.addAll(

        collections.map((collection) => async () => {

          console.log("-------------------------------------------------------------------------");
          console.log(`PROCESSING SLUG: ${collection.slug}`);
          console.log("-------------------------------------------------------------------------");

          const contractAddress = collectionMap[collection.slug].contractAddress

          if (contractAddress) {
            const offers = await getHighestOffer(contractAddress, collection.slug)
            if (offers.length) {
              const quantity = offers[0].quantityFilled + offers[0].quantityRemaining
              const highestOffer = +offers[0].price.netAmount.raw
              const minProfit = +convertEthToWei(collection.minProfit)

              const balance = await getWETHBalance(WALLET_PRIVATE_KEY)
              const balanceWei = balance * 1e18
              const bidPrice = Math.floor(highestOffer + minProfit + (Number(acceptOfferFee)))

              if (balanceWei > bidPrice) {
                const duration = 30
                const currentTime = new Date().getTime();
                const expiration = Math.floor((currentTime + (duration * 60 * 1000)) / 1000);
                const offerData = await createCollectionOffer(address, contractAddress, collection.quantity, bidPrice.toString(), expiration.toString(), wallet)
                const highestOfferData = { quantity: quantity, price: highestOffer, offerId: offers[0].id }

                if (!bidHistory[collection.slug]) {
                  bidHistory[collection.slug] = { orders: [], highestOffer: highestOfferData };
                }
                const prevOrders = bidHistory[collection.slug].orders
                if (offerData) {
                  bidHistory[collection.slug] = { orders: [...prevOrders, offerData.results[0].orderId], highestOffer: highestOfferData }
                }
              } else {

                console.log(`BID PRICE ${bidPrice / 1e18} IS GREATER THAN WETH BALANCE ${balance} SKIP COLLECTION: ${collection.slug}`);
              }
            }
          }
        })
      )

    } catch (error) {
      console.log(error);
    }
  }
}

monitorOrders(slugs)

main()

export async function createCollectionOffer(maker: string,
  collection: string,
  quantity: number,
  weiPrice: string,
  expirationTime: string,
  wallet: ethers.Wallet
) {
  try {
    const order = await createOffer(maker, collection, quantity, weiPrice, expirationTime)

    if (order) {
      const res = await submitSignedOrderData(order, wallet)
      return res
    }
  } catch (error) {
    console.log(error);
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
      const { data: offerResponse } = await limiter.schedule(() =>
        axiosInstance.post<OfferResponse>(
          `${signEndpoint}?signature=${encodeURIComponent(signature)}`,
          data,
          { headers }
        )
      );

      console.log(JSON.stringify(offerResponse));
      return offerResponse

    } catch (error) {
      console.log(error);
    }
  }

}


export async function createOffer(
  maker: string,
  collection: string,
  quantity: number,
  weiPrice: string,
  expirationTime: string
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
    const { data: order } = await limiter.schedule(() => axiosInstance.post<CreateOrderData>('https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/bid/v5', data, { headers }))

    return order
  } catch (error: any) {
    console.log(error.response.data);

  }
}



export async function getWETHBalance(privateKey: string) {
  try {
    const wallet = new Wallet(privateKey, provider);
    const wethContract = new Contract(WETH_ADDRESS, WETH_ABI, wallet);
    const balance = await wethContract.balanceOf(wallet.address);
    const wethBalance = +utils.formatEther(balance);
    return wethBalance;
  } catch (error) {
    console.log('error getting wetj balance', error);
    return 0
  }
}

export async function getHighestOffer(contractAddress: string, slug: string) {
  const url = 'https://nfttools.pro/magiceden/v3/rtp/ethereum/orders/bids/v6';
  const params = {
    collection: contractAddress,
    sortBy: 'price',
    status: 'active',
    excludeEOA: 'false',
    includeCriteriaMetadata: 'true',
    includeDepth: 'true',
    normalizeRoyalties: 'false'
  };

  try {
    const { data } = await limiter.schedule(() => axiosInstance.get<OrdersResponse>(url, { params, headers: headers }))
    const orders = data.orders
      .map((item) => {
        const quantity = item.quantityFilled + item.quantityRemaining
        return { createdAt: item.createdAt, maker: item.maker, amount: (+item.price.amount.raw) / 1e18, netAmount: (+item.price.netAmount.raw) / 1e18, quantity }
      })
      .filter((item) => item.quantity > 999)


    if (orders.length) {
      console.log('-------------------------------------------------');
      console.log(`HIGHEST OFFERS ${slug}`);
      console.table(orders)
      console.log('-------------------------------------------------');
    }

    return data.orders.filter((item) => item.quantityFilled + item.quantityRemaining > 999)

  } catch (error) {
    return []
  }
}


export async function orderCancelRequest(orderIds: string[]) {
  try {
    const url = "https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/cancel/v3"

    const data = {
      orderIds: orderIds
    }
    const { data: order } = await limiter.schedule(() => axiosInstance.post<CancelRequest>(url, data, { headers }))

    return order

  } catch (error: any) {
    console.log(error.response.data);
  }
}


export async function cancelRequest(orderIds: string[], wallet: ethers.Wallet) {
  try {
    const order = await orderCancelRequest(orderIds)
    if (order) {
      const response = await submitCancelRequest(order, orderIds, wallet)
      return response
    }
  } catch (error) {
    console.log(error);
  }
}

export async function submitCancelRequest(order: CancelRequest,
  offerIds: string[], wallet: ethers.Wallet) {

  try {
    if (order) {
      const signData: any = order.steps[0].items[0].data.sign;
      const signature = await wallet._signTypedData(
        signData.domain,
        signData.types,
        signData.value
      );

      console.log('--------------------------------------------');
      console.log(`CANCEL OFFER ${offerIds[0]}`);
      console.log('--------------------------------------------');

      const url = `https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/cancel-signature/v1?signature=${encodeURIComponent(signature)}`

      const data = {
        "orderIds": offerIds,
        "orderKind": "payment-processor-v2"
      }

      const cancelResponse = await limiter.schedule(() => axiosInstance.post(url, data,
        { headers }))

      return cancelResponse
    }
  } catch (error: any) {
    console.log(error);
  }

}

async function monitorOrders(slugs: string[]) {
  async function monitor() {
    try {
      await queue.addAll(
        slugs.map((slug) => async () => {
          const cancelPromises = [];
          if (!bidHistory[slug]) {
            bidHistory[slug] = { orders: [], highestOffer: { price: 0, offerId: "", quantity: 0 } };
          }
          const offerIds = bidHistory[slug]?.orders ?? [];
          if (bidHistory[slug].highestOffer.quantity < 999 || !bidHistory[slug].highestOffer.price || !bidHistory[slug].highestOffer.offerId) {
            for (const offer of offerIds) {
              const cancel = cancelRequest([offer], wallet);
              cancelPromises.push(cancel);
            }
          }
          await Promise.all(cancelPromises);
        })
      )

    } catch (error) {
      console.error("Error during monitoring:", error);
    } finally {
      // Wait for 1 minute before the next check
      await new Promise(resolve => setTimeout(resolve, 60 * 1000));
      monitor(); // Call the monitor function recursively
    }
  }

  monitor(); // Initial call to start the monitoring process
}

async function monitorNFTs(slugs: string[], address: string) {
  const userNFTs = await fetchUserNFTs(address);
  let initialFilteredNFTsCount: InitialFilteredNFTsCount = {};

  // Record initial counts
  slugs.forEach((slug) => {
    const filteredNFTs = filterNFTsByContract(userNFTs, slug);
    initialFilteredNFTsCount[slug] = filteredNFTs.length;
  });

  console.log("Initial filtered NFTs count:", initialFilteredNFTsCount);

  const initialStatsMessage = await formatInitialStats(address, slugs);
  await sendDiscordAlert(initialStatsMessage);

  async function monitor() {
    try {
      const userNFTs = await fetchUserNFTs(address);
      slugs.forEach((slug) => {
        const filteredNFTs = filterNFTsByContract(userNFTs, slug);
        const currentCount = filteredNFTs.length;
        const initialCount = initialFilteredNFTsCount[slug];

        if (currentCount !== initialCount) {
          const message = `NFT count changed for collection ${slug}: Initial count was ${initialCount}, current count is ${currentCount}`;
          console.log(message);
          sendDiscordAlert(message);

          initialFilteredNFTsCount[slug] = currentCount;
        }
      });
    } catch (error) {
      console.error("Error during monitoring:", error);
    } finally {
      // Wait for 5 minutes before the next check
      await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
      monitor(); // Call the monitor function recursively
    }
  }

  monitor(); // Initial call to start the monitoring process
}



export function filterNFTsByContract(nfts: TokenOwnership[], slug: string) {
  if (!nfts || nfts.length === 0) {
    console.log("No NFTs provided for filtering.");
    return [];
  }
  const filtered = nfts.filter(
    (nft) => nft.token && nft.token.collection.slug === slug
  );
  return filtered;
}


interface InitialFilteredNFTsCount {
  [key: string]: number;
}

interface BidHistory {
  [slug: string]: {
    orders: string[];
    highestOffer: {
      offerId: string;
      price: number;
      quantity: number;
    }
  };
}

export async function fetchUserNFTs(address: string) {

  const apiUrl = `https://nfttools.pro/magiceden/v3/rtp/ethereum/users/${address}/tokens/v9?includeLastSale=true&excludeSpam=true&limit=50&sortBy=acquiredAt&sortDirection=desc&onlyListed=false&normalizeRoyalties=false`;
  let headers = {
    "X-NFT-API-Key": X_NFT_API_KEY,
  };
  try {
    const { data } = await limiter.schedule(() =>
      axiosInstance.get(apiUrl, { headers })
    );
    const tokens: TokenOwnership[] = data.tokens;


    console.log(`User owned NFTs: ${tokens.length}`);
    return tokens;
  } catch (error) {
    console.error("Failed to user owned NFTs:", error);
    return [];
  }
}


export function convertEthToWei(ethAmount: string) {
  if (isNaN(parseFloat(ethAmount))) {
    throw new Error(
      "Invalid input: ethAmount must be a number or a numeric string."
    );
  }

  const ethString = ethAmount.toString();
  if (!ethString.match(/^\d+(\.\d+)?$/)) {
    throw new Error(
      "Invalid input format: ethAmount must be a decimal or integer number."
    );
  }

  const [integerPart, decimalPart = ""] = ethString.split(".");
  const paddedDecimalPart = decimalPart.padEnd(18, "0");
  const weiString = integerPart + paddedDecimalPart.slice(0, 18); // Ensure only up to 18 decimal places

  return BigInt(weiString).toString();
}

let initialFilteredNFTsCount: InitialFilteredNFTsCount = {};


export async function formatInitialStats(address: string, collectionSlugs: string[]) {
  const userNFTs: TokenOwnership[] = await fetchUserNFTs(address);

  let stats = "ME Diamond Farmin Bot Started - Current NFT Holdings:\n";

  collectionSlugs.forEach((slug) => {
    const filteredNFTs = filterNFTsByContract(userNFTs, slug);
    initialFilteredNFTsCount[slug] = filteredNFTs.length;

    stats += `Collection: ${slug}, Count: ${filteredNFTs.length}\n`;
  });

  return stats;
}


let diamondData: IDiamond = {
  current: 0,
  firstRun: 1,
  lastCount: 0,
  lastUpdateTime: 0,
  hourlyRate: 0,
  dailyRate: 0,
  weeklyRate: 0,
};




export async function sendDiscordAlert(message: string) {
  try {
    await axios.post(DISCORD_WEBHOOK_URL, { content: message });
    console.log("Discord alert sent:", message);
  } catch (error) {
    console.error("Failed to send Discord alert:", error);
  }
}

interface IDiamond {
  current: number;
  firstRun: number;
  lastCount: number;
  lastUpdateTime: number;
  hourlyRate: number;
  dailyRate: number;
  weeklyRate: number;
}

interface Currency {
  contract: string;
  name: string;
  symbol: string;
  decimals: number;
}

interface Amount {
  raw: string;
  decimal: number;
  usd: number;
  native: number;
}

interface FloorAskPrice {
  currency: Currency;
  amount: Amount;
}

interface Royalty {
  bps: number;
  recipient: string;
}

interface Collection {
  id: string;
  name: string;
  slug: string;
  symbol: string;
  imageUrl: string;
  isSpam: boolean;
  isNsfw: boolean;
  metadataDisabled: boolean;
  openseaVerificationStatus: string;
  magicedenVerificationStatus: string | null;
  floorAskPrice: FloorAskPrice;
  royaltiesBps: number;
  royalties: Royalty[];
}

interface Price {
  currency: Currency;
  amount: Amount;
  netAmount?: Amount;
}

interface FeeBreakdown {
  kind: string;
  bps: number;
  recipient: string;
  rawAmount: string;
  source: string;
}

interface LastSale {
  orderSource: string | null;
  fillSource: string | null;
  timestamp: number;
  price: Price;
  netAmount?: Amount;
  marketplaceFeeBps: number;
  paidFullRoyalty: boolean;
  feeBreakdown: FeeBreakdown[];
}

interface Metadata {
  imageOriginal: string;
  imageMimeType: string;
  tokenURI: string;
}

interface Token {
  chainId: number;
  contract: string;
  tokenId: string;
  kind: string;
  name: string;
  image: string;
  imageSmall: string;
  imageLarge: string;
  metadata: Metadata;
  description: string | null;
  rarityScore: number;
  rarityRank: number;
  supply: string;
  remainingSupply: string;
  media: string | null;
  isFlagged: boolean;
  isSpam: boolean;
  isNsfw: boolean;
  metadataDisabled: boolean;
  lastFlagUpdate: string | null;
  lastFlagChange: string | null;
  collection: Collection;
  lastSale: LastSale;
  lastAppraisalValue: number;
}

interface FloorAsk {
  id: string | null;
  price: Amount | null;
  maker: string | null;
  kind: string | null;
  validFrom: number | null;
  validUntil: number | null;
  source: {
    id: string;
    domain: string;
    name: string;
    icon: string;
    url: string;
  } | null;
}

interface Ownership {
  tokenCount: string;
  onSaleCount: string;
  floorAsk: FloorAsk;
  acquiredAt: string;
}

interface TokenOwnership {
  token: Token;
  ownership: Ownership;
}

export async function getCollectionData(collectionSlugs: string[]) {
  const baseUrl = "https://nfttools.pro/opensea/api/v2/collections/";
  const headers = {
    "X-NFT-API-Key": X_NFT_API_KEY,
  };
  let collectionData: ICollectionDataMap = {};

  await Promise.all(
    collectionSlugs.map(async (slug: string) => {
      try {
        const { data } = await limiter.schedule(() =>
          axiosInstance.get<ICollectionFee>(`${baseUrl}${slug}`, { headers })
        );


        const fees = data.fees || [];
        const unwantedRecipient = "0x0000a26b00c1f0df003000390027140000faa719";
        const totalFees = fees
          .filter(
            (fee) =>
              fee.recipient.toLowerCase() !== unwantedRecipient.toLowerCase()
          )
          .reduce((sum, fee) => sum + parseFloat(fee.fee.toString()), 0);

        collectionData[slug] = { fee: totalFees, contractAddress: data.contracts[0].address };
        // get the contract address

      } catch (error) {
        console.error(`Failed to retrieve fees for collection: ${slug}`, error);
        collectionData[slug] = { fee: null, contractAddress: undefined };
      }
    })
  );

  return collectionData;
}


interface ICollectionFee {
  collection: string;
  name: string;
  description: string;
  image_url: string;
  banner_image_url: string;
  owner: string;
  safelist_status: string;
  category: string;
  is_disabled: boolean;
  is_nsfw: boolean;
  trait_offers_enabled: boolean;
  collection_offers_enabled: boolean;
  opensea_url: string;
  project_url: string;
  wiki_url: string;
  discord_url: string;
  telegram_url: string;
  twitter_username: string;
  instagram_username: string;
  contracts: ContractDetails[];
  editors: string[];
  fees: Fee[];
  rarity: Rarity;
  total_supply: number;
  created_date: string;
}

interface ContractDetails {
  address: string;
  chain: string;
}

interface Fee {
  fee: number;
  recipient: string;
  required: boolean;
}

interface Rarity {
  strategy_id: string;
  strategy_version: string;
  calculated_at: string;
  max_rank: number;
  tokens_scored: number;
}

interface ICollectionDataMap {
  [key: string]: {
    fee: number | null;
    contractAddress: string | undefined
  }
}