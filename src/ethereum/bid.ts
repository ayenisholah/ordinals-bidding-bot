import { ethers, providers, Wallet } from "ethers"
import { updateDiamondData } from "../functions/diamond";
import { getCollectionData } from "../functions/ethereum/Collection";
import { convertEthToWei, fetchUserNFTs, filterNFTsByContract, formatInitialStats, getWETHBalance } from "../utils";
import { sendDiscordAlert } from "../functions/Discord";
import { cancelRequest, createCollectionOffer, getHighestOffer } from "../functions/ethereum/Bid";
import { config } from "dotenv"

config()

const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY as string;
const POLL_INTERVAL = 60 * 1000; // 1 minute in milliseconds

const startPolling = () => {
  updateDiamondData();
  setInterval(updateDiamondData, POLL_INTERVAL);
};

startPolling();

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

monitorNFTs(slugs, address)
const bidHistory: BidHistory = {}

async function main() {
  while (true) {
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

            const balance = await getWETHBalance(WALLET_PRIVATE_KEY)
            const balanceWei = balance * 1e18
            const bidPrice = Math.floor(highestOffer + minProfit + (Number(acceptOfferFee)))

            if (balanceWei < bidPrice) {
              console.log(`BID PRICE ${bidPrice / 1e18} IS GREATER THAN WETH BALANCE ${balance} SKIP COLLECTION: ${collection.slug}`);

              continue
            }
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
}

monitorOrders(slugs)

main()

async function monitorOrders(slugs: string[]) {
  setInterval(async () => {
    try {
      const cancelPromises = []
      for (const slug of slugs) {
        const offerIds = bidHistory[slug].orders
        if (bidHistory[slug].highestOffer.quantity < 999 || !bidHistory[slug].highestOffer.price || !bidHistory[slug].highestOffer.offerId) {
          for (const offer of offerIds) {
            const cancel = cancelRequest([offer], wallet)
            cancelPromises.push(cancel)
          }
        }
      }
      Promise.all(cancelPromises)
    } catch (error) {
      console.error("Error during monitoring:", error);
    }
  }, 60 * 1000);
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