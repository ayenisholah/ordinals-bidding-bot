import { config } from "dotenv"
import fs from "fs"
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import PQueue from "p-queue"
import { getBitcoinBalance } from "./utils";
import { IOffer, createOffer, getBestOffer, getOffers, getUserOffers, retrieveCancelOfferFormat, signData, submitCancelOfferData, submitSignedOfferOrder } from "./functions/Offer";
import { OfferPlaced, collectionDetails } from "./functions/Collection";
import { retrieveTokens } from "./functions/Tokens";
import axiosInstance from "./axios/axiosInstance";
import limiter from "./bottleneck";

config()

const TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const DEFAULT_OUTBID_MARGIN = Number(process.env.DEFAULT_OUTBID_MARGIN) || 0.00001
const API_KEY = process.env.API_KEY as string;
const RATE_LIMIT = Number(process.env.RATE_LIMIT) ?? 8
const DEFAULT_OFFER_EXPIRATION = 30
const FEE_RATE_TIER = 'halfHourFee'
const CONVERSION_RATE = 100000000

const network = bitcoin.networks.bitcoin;

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

const DEFAULT_COUNTER_BID_LOOP_TIME = 180
const DEFAULT_LOOP = 20
let RESTART = true


const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}



const filePath = `${__dirname}/collections.json`
const collections: CollectionData[] = JSON.parse(fs.readFileSync(filePath, "utf-8"))
let balance: number;

interface BidHistory {
  [collectionSymbol: string]: {
    ourBids: {
      [tokenId: string]: number;
    };
    topBids: {
      [tokenId: string]: boolean;
    };
    topListings: {
      id: string;
      price: number;
    }[]
    lastSeenActivity: number | null
  };
}

const bidHistory: BidHistory = {};

async function processScheduledLoop(item: CollectionData) {
  console.log('----------------------------------------------------------------------');
  console.log(`START AUTOBID SCHEDULE FOR ${item.collectionSymbol}`);
  console.log('----------------------------------------------------------------------');

  const collectionSymbol = item.collectionSymbol
  const minBid = item.minBid
  const maxBid = item.maxBid
  const bidCount = item.bidCount ?? 20
  const duration = item.duration ?? DEFAULT_OFFER_EXPIRATION
  const outBidMargin = item.outBidMargin ?? DEFAULT_OUTBID_MARGIN
  const scheduledLoop = item.scheduledLoop ?? DEFAULT_LOOP;
  const buyerTokenReceiveAddress = item.receiverWallet ?? TOKEN_RECEIVE_ADDRESS;
  const privateKey = item.fundingWalletWIF ?? PRIVATE_KEY;
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');

  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

  const queue = new PQueue({
    concurrency: 1.5 * RATE_LIMIT
  });

  try {
    const collectionData = await collectionDetails(collectionSymbol)

    const tokens = await retrieveTokens(collectionSymbol, bidCount)


    if (!bidHistory[collectionSymbol]) {
      bidHistory[collectionSymbol] = {
        ourBids: {},
        topBids: {},
        topListings: [],
        lastSeenActivity: null
      };
    }

    if (RESTART) {
      balance = 50000
      const offerData = await getUserOffers(buyerTokenReceiveAddress)
      if (offerData && offerData.offers.length > 0) {
        const offers = offerData.offers
        offers.forEach((item) => {
          if (!bidHistory[item.token.collectionSymbol]) {
            bidHistory[item.token.collectionSymbol] = {
              ourBids: {},
              topBids: {},
              topListings: [],
              lastSeenActivity: null
            };
          }
          bidHistory[item.token.collectionSymbol].topBids[item.tokenId] = true
          bidHistory[item.token.collectionSymbol].ourBids[item.tokenId] = item.price;
        })
      }
      RESTART = false
    }
    const topListings = bidHistory[collectionSymbol].topListings.length === bidCount ? bidHistory[collectionSymbol].topListings : tokens.slice(0, bidCount).map((item) => ({ id: item.id, price: item.listedPrice }))


    bidHistory[collectionSymbol].topListings = topListings;

    console.log('--------------------------------------------------------------------------------');
    console.log(`BUYER PAYMENT ADDRESS: ${buyerPaymentAddress}`);
    console.log(`BUYER TOKEN RECEIVE ADDRESS: ${buyerTokenReceiveAddress}`);
    console.log('--------------------------------------------------------------------------------');

    const currentTime = new Date().getTime();
    const expiration = currentTime + (duration * 60 * 1000);
    const minPrice = Math.ceil(minBid * CONVERSION_RATE)
    const maxPrice = Math.ceil(maxBid * CONVERSION_RATE)
    const floorPrice = Number(collectionData?.floorPrice) ?? 0

    console.log('--------------------------------------------------------------------------------');
    console.log(`COLLECTION SYMBOL: ${collectionSymbol}`);
    console.log("MAX PRICE: ", maxPrice);
    console.log("MIN PRICE: ", minPrice);
    console.log("FLOOR PRICE: ", floorPrice);
    console.log('--------------------------------------------------------------------------------');

    const listedMakerFeeBp = tokens?.[0]?.listedMakerFeeBp ?? 0;
    const makerFee = listedMakerFeeBp / 100 / 100

    console.log('--------------------------------------------------------------------------------');
    console.log('MAKER FEE: ', makerFee);
    console.log('--------------------------------------------------------------------------------');

    await queue.addAll(
      topListings.map(token => async () => {
        const { id: tokenId, price: listedPrice } = token

        const bestOffer = await getBestOffer(tokenId);
        const ourExistingOffer = bidHistory[collectionSymbol].ourBids[tokenId];



        if (bestOffer && bestOffer.offers && bestOffer.offers.length > 0) {
          const [topOffer, secondTopOffer] = bestOffer.offers
          const bestPrice = topOffer.price
          const secondBestPrice = secondTopOffer?.price ?? 0

          const isOurs = topOffer.buyerPaymentAddress === buyerPaymentAddress
          const bidExpired = Date.now() > topOffer.expirationDate

          if (topOffer.buyerPaymentAddress !== buyerPaymentAddress || secondTopOffer.buyerPaymentAddress !== buyerPaymentAddress) {
            const bidPrice = Math.ceil(Math.max(listedPrice * 0.5, minPrice))
            await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)
            bidHistory[collectionSymbol].ourBids[tokenId] = bestPrice;
            bidHistory[collectionSymbol].topBids[tokenId] = true;
          }


          if (isOurs) {
            console.log('--------------------------------------------------------------------------------');
            console.log(`YOU ALREADY HAVE THE HIGHEST OFFER FOR THIS TOKEN ${collectionSymbol}`);
            console.log('--------------------------------------------------------------------------------');

            const outBidAmount = Math.ceil(outBidMargin * CONVERSION_RATE)
            const offerDifference = Math.ceil(bestPrice - secondBestPrice)

            if (offerDifference > outBidAmount && Math.ceil(secondBestPrice + outBidAmount) > (listedPrice * 0.5)) {
              const newPrice = Math.ceil(secondBestPrice + outBidAmount)
              console.log('------------------------------------------------------------------------------------------------------------------------');
              console.log(`DIFFERENCE BETWEEN THE BEST PRICE AND SECOND BEST PRICE ${offerDifference} IS GREATER THAN OUTBID MARGIN ${outBidAmount}`);
              console.log({ tokenId, collectionSymbol });
              console.log('------------------------------------------------------------------------------------------------------------------------');

              await cancelBid(topOffer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)

              placeBid(tokenId, newPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)

              // UPDATE BID RECORD
              bidHistory[collectionSymbol].ourBids[tokenId] = newPrice;
              bidHistory[collectionSymbol].topBids[tokenId] = true;
            }


            const currentPrice = bidHistory[collectionSymbol].ourBids[tokenId]
            const newPrice = Math.ceil(Math.max(listedPrice * 0.5, minPrice))

            if (currentPrice !== newPrice && RESTART === true) {
              console.log('--------------------------------------------------------------------------------');
              console.log(`NEW BID CONFIGURATION DETECTED ${collectionSymbol}`);
              console.log('--------------------------------------------------------------------------------');

              if (topOffer.buyerPaymentAddress === buyerPaymentAddress && topOffer.expirationDate > Date.now() + 10000 && topOffer.isValid) {
                await cancelBid(topOffer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
                console.log('--------------------------------------------------------------------------------');
                console.log(`CANCEL OLD BID ${collectionSymbol}`);
                console.log('--------------------------------------------------------------------------------');
                placeBid(tokenId, newPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)
                bidHistory[collectionSymbol].ourBids[tokenId] = newPrice;
                bidHistory[collectionSymbol].topBids[tokenId] = true;
              } else {
                placeBid(tokenId, newPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)
                bidHistory[collectionSymbol].ourBids[tokenId] = newPrice;
                bidHistory[collectionSymbol].topBids[tokenId] = true;
              }

            }

            console.log('--------------------------------------------------------------------------------');
            console.log({ collectionSymbol, tokenId, price: topOffer.price, buyerPaymentAddress: topOffer.buyerPaymentAddress });
            console.log('--------------------------------------------------------------------------------');
          }


          if (!isOurs && bestPrice <= maxPrice) {

            if (ourExistingOffer) {
              await cancelBid(topOffer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
              console.log('--------------------------------------------------------------------------------');
              console.log(`CANCELLED OFFER FOR ${topOffer.token.collectionSymbol} ${topOffer.token.id}`);
              console.log('--------------------------------------------------------------------------------');
              delete bidHistory[collectionSymbol].topBids[tokenId];
              delete bidHistory[collectionSymbol].ourBids[tokenId];
            }

            const currentBidCount = Object.values(
              bidHistory[collectionSymbol].topBids
            ).filter(Boolean).length;

            if (currentBidCount < bidCount) {
              const bidPrice = Math.ceil(Math.min(bestPrice + (outBidMargin * CONVERSION_RATE), maxPrice))
              if (!isOurs && bidPrice < balance) {
                await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)
                bidHistory[collectionSymbol].ourBids[tokenId] = bidPrice;
                bidHistory[collectionSymbol].topBids[tokenId] = true;
              }
            }
          }
        } else {
          const currentBidCount = Object.values(
            bidHistory[collectionSymbol].topBids
          ).filter(Boolean).length;
          if (currentBidCount < bidCount) {
            const bidPrice = Math.ceil(Math.max(minPrice, listedPrice * 0.5));
            if (bidPrice < balance) {
              await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol);
              bidHistory[collectionSymbol].ourBids[tokenId] = bidPrice;
              bidHistory[collectionSymbol].topBids[tokenId] = true;
            }
          }
        }
      })
    )
  } catch (error) {
    throw error
  }
  setTimeout(() => processScheduledLoop(item), scheduledLoop * 1000);
}

async function processCounterBidLoop(item: CollectionData) {
  console.log('----------------------------------------------------------------------');
  console.log(`START COUNTERBID SCHEDULE FOR ${item.collectionSymbol}`);
  console.log('----------------------------------------------------------------------');


  const collectionSymbol = item.collectionSymbol
  const minBid = item.minBid
  const maxBid = item.maxBid
  const bidCount = item.bidCount ?? 20
  const duration = item.duration ?? DEFAULT_OFFER_EXPIRATION
  const outBidMargin = item.outBidMargin ?? DEFAULT_OUTBID_MARGIN
  const counterbidLoop = item.counterbidLoop ?? DEFAULT_COUNTER_BID_LOOP_TIME;
  const buyerTokenReceiveAddress = item.receiverWallet ?? TOKEN_RECEIVE_ADDRESS;
  const privateKey = item.fundingWalletWIF ?? PRIVATE_KEY;
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');
  const currentTime = new Date().getTime();
  const expiration = currentTime + (duration * 60 * 1000);

  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

  const minPrice = Math.ceil(minBid * CONVERSION_RATE)
  const maxPrice = Math.ceil(maxBid * CONVERSION_RATE)


  if (!bidHistory[collectionSymbol]) {
    bidHistory[collectionSymbol] = {
      ourBids: {},
      topBids: {},
      topListings: [],
      lastSeenActivity: null
    };
  }

  if (RESTART) {
    balance = 50000
    const offerData = await getUserOffers(buyerTokenReceiveAddress)
    if (offerData && offerData.offers.length > 0) {
      const offers = offerData.offers
      offers.forEach((item) => {
        if (!bidHistory[item.token.collectionSymbol]) {
          bidHistory[item.token.collectionSymbol] = {
            ourBids: {},
            topBids: {},
            topListings: [],
            lastSeenActivity: null
          };
        }
        bidHistory[item.token.collectionSymbol].topBids[item.tokenId] = true
        bidHistory[item.token.collectionSymbol].ourBids[item.tokenId] = item.price;
      })
    }
    RESTART = false
  }


  try {
    const lastSeenTimestamp = bidHistory[collectionSymbol]?.lastSeenActivity;


    const activities = await getCollectionActivity(
      collectionSymbol,
      lastSeenTimestamp
    );

    if (activities.length > 0) {
      bidHistory[collectionSymbol].lastSeenActivity = new Date(activities[0].createdAt).getTime();
    }

    const offers = activities.filter(
      (activity) => activity.kind === "offer_placed"
    );

    const listings = activities.filter((activity) => activity.kind === "list");

    const uniqueOffers = offers.reduce((acc, offer) => {
      const existingOffer = acc.find((o) => o.tokenId === offer.tokenId);
      if (!existingOffer || offer.listedPrice > existingOffer.listedPrice) {
        acc = [...acc.filter((o) => o.tokenId !== offer.tokenId), offer];
      }
      return acc;
    }, [] as OfferPlaced[]);

    for (const offer of uniqueOffers) {
      const { tokenId, listedPrice: offerPrice } = offer;
      const isOurs = offer.buyerPaymentAddress === buyerPaymentAddress
      const newPrice = Math.ceil(offerPrice + (outBidMargin * CONVERSION_RATE));

      const ownBid = bidHistory[collectionSymbol].ourBids[tokenId]

      if (isOurs) {
        console.log('--------------------------------------------------------------------------------');
        console.log(`YOU ALREADY HAVE THE HIGHEST OFFER FOR THIS TOKEN ${collectionSymbol}`);
        console.log({ collectionSymbol, tokenId, offerPrice });
        console.log('--------------------------------------------------------------------------------');
      }

      if (!isOurs && bidHistory[collectionSymbol].topBids[tokenId] && offerPrice > ownBid) {

        if (newPrice > balance) {
          console.log('----------------------------------------------------------------------');
          console.log(`BID PRICE ${newPrice} EXCEEDS BALANCE ${balance} SKIP TOKEN`);
          console.log('----------------------------------------------------------------------');
          continue
        }

        if (newPrice <= maxPrice) {
          const offerData = await getOffers(tokenId, buyerTokenReceiveAddress)
          if (offerData && offerData.offers.length > 0) {
            const offer = offerData.offers[0]
            if (offer.buyerPaymentAddress === buyerPaymentAddress) {
              await cancelBid(offer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress);
              delete bidHistory[collectionSymbol].topBids[tokenId];
              delete bidHistory[collectionSymbol].ourBids[tokenId];
            }
          }

          console.log('----------------------------------------------------------------------');
          console.log(`INITIATE COUNTER BID ${collectionSymbol}`);
          console.log({ collectionSymbol, tokenId, newPrice, currentOfferPrice: offerPrice });
          console.log('----------------------------------------------------------------------');
          await placeBid(tokenId, newPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol);
          bidHistory[collectionSymbol].topBids[tokenId] = true;
        }
      }
    }
    const uniqueListings = listings.reduce((acc, listing) => {
      if (!acc.some((l) => l.tokenId === listing.tokenId)) {
        acc.push(listing);
      }
      return acc;
    }, [] as OfferPlaced[])
      .map((item) => ({ id: item.tokenId, price: item.listedPrice }))
      .sort((a, b) => a.price - b.price)
      .slice(0, bidCount)

    const previousBottomListings = bidHistory[collectionSymbol].topListings


    console.log('----------------------------------------------------------------------');
    console.log(`PREVIOUS BOTTOM LISTINGS ${collectionSymbol}`);
    console.log(console.table(previousBottomListings));
    console.log('----------------------------------------------------------------------');

    console.log('----------------------------------------------------------------------');
    console.log('NEW LISTING FOUND');
    console.log(console.table(uniqueListings));
    console.log('----------------------------------------------------------------------');

    const userOffers = await getUserOffers(buyerTokenReceiveAddress)

    const ourBids = userOffers?.offers
      .filter(item => item.token.collectionSymbol.toLowerCase() === collectionSymbol.toLowerCase())
      .map((item) => ({ id: item.tokenId, price: item.price })) ?? []

    console.log('----------------------------------------------------------------------');
    console.log(`YOUR CURRENT BID ${collectionSymbol}`);
    console.log(console.table(ourBids));
    console.log('----------------------------------------------------------------------');

    let newBottomListings = [...previousBottomListings, ...uniqueListings].sort((a, b) => a.price - b.price)

    newBottomListings = removeDuplicateTokens(newBottomListings)

    newBottomListings = newBottomListings.slice(0, bidCount)

    console.log('----------------------------------------------------------------------');
    console.log(`NEW BOTTOM LISTINGS ${collectionSymbol}`);
    console.log(console.table(newBottomListings));
    console.log('----------------------------------------------------------------------');


    const tokensToCancel = findTokensToCancel(previousBottomListings, newBottomListings)
    const newListings = findTokensToBidOn(previousBottomListings, newBottomListings)


    console.log('----------------------------------------------------------------------');
    console.log(`TOKENS TO CANCEL OFFERS FOR ${collectionSymbol}`);
    console.log(console.table(tokensToCancel));
    console.log('----------------------------------------------------------------------');


    console.log('----------------------------------------------------------------------');
    console.log(`NEW LISTINGS TO BID ON ${collectionSymbol}`);
    console.log(console.table(newListings));
    console.log('----------------------------------------------------------------------');


    for (const token of tokensToCancel) {

      const offerData = await getOffers(token.id, buyerTokenReceiveAddress)
      if (offerData && offerData.offers.length > 0) {
        const offer = offerData.offers[0]
        console.log('----------------------------------------------------------------------');
        console.log(`CANCEL PREVIOUS BOTTOM LISTING TOKEN: ${collectionSymbol}`);
        console.log({ collectionSymbol, tokenId: token.id, offerPrice: offer.price });
        console.log('----------------------------------------------------------------------');
        await cancelBid(offer, privateKey, collectionSymbol, token.id, buyerPaymentAddress);
        delete bidHistory[collectionSymbol].topBids[token.id];
        delete bidHistory[collectionSymbol].ourBids[token.id];
      }
    }


    for (const listing of newListings) {
      const bidPrice = Math.ceil(listing.price * 0.5)
      if (bidPrice >= minPrice && bidPrice <= maxPrice) {

        if (bidPrice > balance) {
          console.log('----------------------------------------------------------------------');
          console.log(`BID PRICE ${bidPrice} EXCEEDS BALANCE ${balance} SKIP BIDDING ${collectionSymbol}`);
          console.log('----------------------------------------------------------------------');
          continue
        }

        console.log('----------------------------------------------------------------------');
        console.log(`BID ON NEW BOTTOM LISTING: ${collectionSymbol} ${listing.id} ${collectionSymbol}`);
        console.log('----------------------------------------------------------------------');

        const offerData = await getOffers(listing.id, buyerTokenReceiveAddress)

        if (offerData && offerData.offers.length > 0) {
          const offer = offerData.offers[0]

          if (offer.buyerPaymentAddress = buyerPaymentAddress) {
            await cancelBid(offer, privateKey, collectionSymbol, listing.id, buyerPaymentAddress);
          }
        }


        await placeBid(listing.id, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)
        bidHistory[collectionSymbol].topBids[listing.id] = true;
        bidHistory[collectionSymbol].ourBids[listing.id] = bidPrice
      }
    }

    bidHistory[collectionSymbol].topListings = newBottomListings;
  } catch (error) {
    console.log(error);
  }
  setTimeout(() => processCounterBidLoop(item), counterbidLoop * 1000);
}

collections.forEach(async (item) => {
  // await processScheduledLoop(item);
  await processCounterBidLoop(item)
});



function writeBidHistoryToFile() {
  const jsonString = JSON.stringify(bidHistory, null, 2);
  const filePath = 'bidHistory.json';

  fs.writeFile(filePath, jsonString, 'utf-8', (err) => {
    if (err) {
      console.error('Error writing bidHistory to file:', err);
      return;
    }
    console.log('bidHistory has been written to bidHistory.json');
  });
}

process.on('SIGINT', () => {
  console.log('Received SIGINT signal. Writing bidHistory to file...');
  writeBidHistoryToFile();
  process.exit(0)
});

async function getCollectionActivity(
  collectionSymbol: string,
  lastSeenTimestamp: number | null = null
) {
  const url = "https://nfttools.pro/magiceden/v2/ord/btc/activities";
  const params: any = {
    limit: 100,
    collectionSymbol,
    kind: ["list", "offer_placed"],
  };

  try {
    let allActivities: OfferPlaced[] = [];
    let response;
    let offset = 0;

    do {
      params.offset = offset;
      response = await limiter.schedule({ priority: 5 }, () =>
        axiosInstance.get(url, { params, headers })
      );

      allActivities = [...allActivities, ...response.data.activities];
      offset += response.data.activities.length;
    } while (allActivities === params.limit && (!lastSeenTimestamp || new Date(allActivities[allActivities.length - 1].createdAt).getTime() > lastSeenTimestamp));

    if (lastSeenTimestamp) {
      const lastSeenIndex = allActivities.findIndex(
        (activity) => new Date(activity.createdAt).getTime() <= lastSeenTimestamp
      );
      if (lastSeenIndex !== -1) {
        allActivities = allActivities.slice(0, lastSeenIndex);
      }
    }

    return allActivities;
  } catch (error: any) {
    console.error("Error fetching collection activity:", error.data);
    return [];
  }
}

async function cancelBid(offer: IOffer, privateKey: string, collectionSymbol: string, tokenId: string, buyerPaymentAddress: string) {
  try {
    if (offer.buyerPaymentAddress === buyerPaymentAddress && offer.expirationDate > Date.now() + 10000 && offer.isValid === true) {
      const offerFormat = await retrieveCancelOfferFormat(offer.id)
      if (offerFormat) {
        const signedOfferFormat = signData(offerFormat, privateKey)
        if (signedOfferFormat) {
          await submitCancelOfferData(offer.id, signedOfferFormat)
          console.log('--------------------------------------------------------------------------------');
          console.log(`CANCELLED OFFER FOR ${collectionSymbol} ${tokenId}`);
          console.log('--------------------------------------------------------------------------------');
        }
      }
    }
  } catch (error) {
    console.log(error);
  }
}

function findTokensToCancel(previousBottomListings: Token[], newBottomListings: Token[]): Token[] {
  const tokensToCancel: Token[] = [];
  for (const token of previousBottomListings) {
    if (!newBottomListings.some(newToken => newToken.id === token.id)) {
      tokensToCancel.push(token);
    }
  }
  return tokensToCancel;
}

function findTokensToBidOn(previousBottomListings: Token[], newBottomListings: Token[]): Token[] {
  const tokensToBidOn: Token[] = [];
  for (const token of newBottomListings) {
    if (!previousBottomListings.some(prevToken => prevToken.id === token.id)) {
      tokensToBidOn.push(token);
    }
  }
  return tokensToBidOn;
}

async function placeBid(
  tokenId: string,
  offerPrice: number,
  expiration: number,
  buyerTokenReceiveAddress: string,
  buyerPaymentAddress: string,
  publicKey: string,
  privateKey: string,
  collectionSymbol: string
) {
  try {
    const price = Math.ceil(offerPrice)
    const unsignedOffer = await createOffer(tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, FEE_RATE_TIER)
    const signedOffer = await signData(unsignedOffer, privateKey)
    if (signedOffer) {

      await submitSignedOfferOrder(signedOffer, tokenId, offerPrice, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, FEE_RATE_TIER)

      console.log({
        collectionSymbol,
        tokenId,
        price,
        buyerTokenReceiveAddress,
        buyerPaymentAddress,
        bid: true,
      });
    }

  } catch (error) {
    console.log(error);
  }
}

const findNewListings = (newBottomListing: Listing[], oldBottomListings: Listing[]): Listing[] => {
  return newBottomListing.filter((newListing) => {
    return !oldBottomListings.some((oldListing) => oldListing.id === newListing.id);
  });
};

function removeDuplicateTokens(newBottomListings: Token[]): Token[] {
  const idMap = new Map<string, boolean>();
  const uniqueTokens: Token[] = [];

  for (const token of newBottomListings) {
    if (!idMap.has(token.id)) {
      idMap.set(token.id, true);
      uniqueTokens.push(token);
    }
  }

  return uniqueTokens;
}
interface Listing {
  id: string
  price: number
}
export interface CollectionData {
  collectionSymbol: string;
  minBid: number;
  maxBid: number;
  outBidMargin: number;
  bidCount: number;
  duration: number;
  fundingWalletWIF?: string;
  receiverWallet?: string;
  scheduledLoop?: number;
  counterbidLoop?: number
}

interface Token {
  id: string;
  price: number;
}