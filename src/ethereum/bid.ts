import { ethers, providers, Wallet } from "ethers"
import axiosInstance from "../axios/axiosInstance";
import limiter from "../bottleneck";
import { updateDiamondData } from "../functions/diamond";
import readline from "readline";
import { getCollectionData } from "../functions/ethereum/Collection";
import { convertEthToWei, fetchUserNFTs, filterNFTsByContract, formatInitialStats } from "../utils";
import { sendDiscordAlert } from "../functions/Discord";
import { createCollectionOffer, createOffer, getHighestOffer, submitSignedOrderData } from "../functions/ethereum/Bid";


const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY as string;
const X_NFT_API_KEY = process.env.API_KEY;

const POLL_INTERVAL = 60 * 1000; // 1 minute in milliseconds

let diamondData = {
  current: 0,
  firstRun: 1,
  lastCount: 0,
  lastUpdateTime: null,
  hourlyRate: 0,
  dailyRate: 0,
  weeklyRate: 0,
};

const startPolling = () => {
  updateDiamondData(); // Initial update
  setInterval(updateDiamondData, POLL_INTERVAL); // Poll at regular intervals
};

// startPolling();

const collections = [
  { slug: "boredapeyachtclub", minProfit: "0.00001", quantity: 1 },
  { slug: "pudgypenguins", minProfit: "0.00001", quantity: 1 },
  { slug: "nouns", minProfit: "0.00001", quantity: 1 },
  { slug: "kizunagenesis", minProfit: "0.00001", quantity: 1 }
]

const slugs = collections.map((item) => item.slug)


const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY as string;
const NETWORK = "mainnet"
const provider = new providers.AlchemyProvider(NETWORK, ALCHEMY_API_KEY)
const wallet = new Wallet(WALLET_PRIVATE_KEY)
const address = wallet.address

// monitorNFTs(slugs, address)

let RESTART = true

const bidHistory: BidHistory = {}

async function main() {
  try {
    const gasPrice = await provider.getGasPrice()
    const gasPriceInEther = +ethers.utils.formatEther(gasPrice);
    const acceptOfferAmount = 200000
    const acceptOfferFee = convertEthToWei((gasPriceInEther * acceptOfferAmount).toString())
    const collectionMap = await getCollectionData(slugs)

    for (const collection of collections) {
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
          const bidPrice = Math.floor(highestOffer - minProfit - (Number(acceptOfferFee)))
          const duration = 30
          const currentTime = new Date().getTime();
          const expiration = Math.floor((currentTime + (duration * 60 * 1000)) / 1000);
          const offerData = await createCollectionOffer(address, contractAddress, collection.quantity, bidPrice.toString(), expiration.toString(), wallet)
          const fee = collectionMap[collection.slug].fee

          console.log(
            {
              amount: +offers[0].price.amount.raw / 1e18,
              netAmount: +offers[0].price.netAmount.raw / 1e18,
              minProfit: collection.minProfit,
              bidPrice: bidPrice / 1e18,
              fee,
              acceptOfferFee: +acceptOfferFee / 1e18
            });


          const highestOfferData = { quantity: quantity, price: highestOffer, offerId: offers[0].id }

          if (!bidHistory[collection.slug]) {
            bidHistory[collection.slug] = { orders: [], highestOffer: highestOfferData };
          }
          const prevOrders = bidHistory[collection.slug].orders
          if (offerData) {
            bidHistory[collection.slug] = { orders: [...prevOrders, offerData.results[0].orderId], highestOffer: highestOfferData }
          }
        }
      }
    }

  } catch (error) {
    console.log(error);
  }
}

main()

// Function to get all orders as a single array of strings
function getAllOrders(bidHistory: BidHistory): string[] {
  return Object.values(bidHistory)
    .flatMap(entry => entry.orders);
}



async function monitorOrders() {
  // check 
  setInterval(async () => {
    try {
      let offerIds: string[]
      // if restart is true
      if (RESTART === true) {
        // get all offers from the API
      } else {
        offerIds = getAllOrders(bidHistory);
      }

    } catch (error) {
      console.error("Error during monitoring:", error);
    }
  }, 5 * 60 * 1000);
}

async function monitorNFTs(slugs: string[], address: string) {
  const fees = getCollectionData(slugs)

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

  setInterval(async () => {
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
    }
  }, 5 * 60 * 1000);
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