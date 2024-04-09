import { config } from "dotenv"
import fs from "fs"
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import PQueue from "p-queue"
import { getBitcoinBalance } from "./utils";
import { IOffer, createOffer, getBestOffer, getOffers, getUserOffers, retrieveCancelOfferFormat, signData, submitCancelOfferData, submitSignedOfferOrder } from "./functions/Offer";
import { OfferPlaced, collectionDetails } from "./functions/Collection";
import { ITokenData, getToken, retrieveTokens } from "./functions/Tokens";
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

const DEFAULT_COUNTER_BID_LOOP_TIME = 30
const DEFAULT_LOOP = 30
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
    topOffers: {
      [tokenId: string]: {
        price: number,
        buyerPaymentAddress: string
      }
    },
    ourBids: {
      [tokenId: string]: {
        price: number,
        expiration: number
      };
    };
    topBids: {
      [tokenId: string]: boolean;
    };
    bottomListings: {
      id: string;
      price: number;
    }[]
    lastSeenActivity: number | null | undefined
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


    if (!bidHistory[collectionSymbol]) {
      bidHistory[collectionSymbol] = {
        topOffers: {},
        ourBids: {},
        topBids: {},
        bottomListings: [],
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
              topOffers: {},
              ourBids: {},
              topBids: {},
              bottomListings: [],
              lastSeenActivity: null
            };
          }
          bidHistory[item.token.collectionSymbol].topBids[item.tokenId] = true
          bidHistory[item.token.collectionSymbol].ourBids[item.tokenId] = {
            price: item.price,
            expiration: item.expirationDate
          }
          bidHistory[collectionSymbol].lastSeenActivity = Date.now()
        })
      }
      RESTART = false
    }

    let tokens = await retrieveTokens(collectionSymbol, bidCount)
    tokens = tokens.slice(0, bidCount)

    bidHistory[collectionSymbol].bottomListings = tokens.map(item => ({ id: item.id, price: item.listedPrice }))
      .sort((a, b) => a.price - b.price)

    const bottomListings = bidHistory[collectionSymbol].bottomListings

    console.log('--------------------------------------------------------------------------------');
    console.log(`BOTTOM LISTING FOR ${collectionSymbol}`);
    console.table(bottomListings)
    console.log('--------------------------------------------------------------------------------');

    console.log('--------------------------------------------------------------------------------');
    console.log(`BUYER PAYMENT ADDRESS: ${buyerPaymentAddress}`);
    console.log(`BUYER TOKEN RECEIVE ADDRESS: ${buyerTokenReceiveAddress}`);
    console.log('--------------------------------------------------------------------------------');

    const currentTime = new Date().getTime();
    const expiration = currentTime + (duration * 60 * 1000);
    const minPrice = Math.round(minBid * CONVERSION_RATE)
    const maxPrice = Math.round(maxBid * CONVERSION_RATE)
    const floorPrice = Number(collectionData?.floorPrice) ?? 0

    console.log('--------------------------------------------------------------------------------');
    console.log(`COLLECTION SYMBOL: ${collectionSymbol}`);
    console.log("MAX PRICE: ", maxPrice);
    console.log("MIN PRICE: ", minPrice);
    console.log("FLOOR PRICE: ", floorPrice);
    console.log('--------------------------------------------------------------------------------');

    const maxFloorBid = item.maxFloorBid < 100 ? item.maxFloorBid : 100
    const minFloorBid = item.maxFloorBid



    console.log('--------------------------------------------------------------------------------');
    console.log('BID RANGE AS A PERCENTAGE FLOOR PRICE');

    console.log("MAX PRICE PERCENTAGE OF FLOOR: ", Math.round(maxFloorBid * floorPrice / 100));
    console.log("MIN PRICE PERCENTAGE OF FLOOR: ", Math.round(minFloorBid * floorPrice / 100));
    console.log('--------------------------------------------------------------------------------');


    const minOffer = Math.max(minPrice, Math.round(minFloorBid * floorPrice / 100))
    const maxOffer = Math.max(maxPrice, Math.round(minFloorBid * floorPrice / 100))


    const userBids = Object.entries(bidHistory).flatMap(([collectionSymbol, bidData]) => {
      return Object.entries(bidData.ourBids).map(([tokenId, bidInfo]) => ({
        collectionSymbol,
        tokenId,
        price: bidInfo.price,
        expiration: new Date(bidInfo.expiration).toISOString(),
      }));
    }).sort((a, b) => a.price - b.price)

    const ourBids = userBids.map((item) => item.tokenId)
    const tokensToCancel = findTokensToCancel(tokens, ourBids)

    console.log('--------------------------------------------------------------------------------');
    console.log('USER BIDS');
    console.table(userBids)
    console.log('--------------------------------------------------------------------------------');

    const bottomListingBids = combineBidsAndListings(userBids, bottomListings)
    console.log('--------------------------------------------------------------------------------');
    console.log('BOTTOM LISTING BIDS');
    console.table(bottomListingBids)
    console.log('--------------------------------------------------------------------------------');


    console.log('--------------------------------------------------------------------------------');
    console.log('TOKENS TO CANCEL');
    console.table(tokensToCancel)
    console.log('--------------------------------------------------------------------------------');

    if (tokensToCancel.length > 0) {
      for (const tokenId of tokensToCancel) {

        const offerData = await getOffers(tokenId, buyerTokenReceiveAddress)
        if (offerData && Number(offerData.total) > 0) {
          const offer = offerData.offers[0]

          cancelBid(offer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
        }
        delete bidHistory[collectionSymbol].ourBids[tokenId]
        delete bidHistory[collectionSymbol].topBids[tokenId]
      }
    }

    await queue.addAll(
      bottomListings.map(token => async () => {
        const { id: tokenId, price: listedPrice } = token

        const bestOffer = await getBestOffer(tokenId);
        const ourExistingOffer = bidHistory[collectionSymbol].ourBids[tokenId]?.expiration > Date.now()
        const currentBidCount = Object.values(bidHistory[collectionSymbol].topBids).length;

        /*
        * This condition executes in a scenario where we're not currently bidding on a token,
        * and our total bids for that collection are less than the desired bid count.
        *
        * If there's an existing offer on that token:
        *   - It first checks to ensure that we're not the owner of the existing offer.
        *   - If we're not the owner, it proceeds to outbid the existing offer.
        *
        * If there's no existing offer on the token:
        *   - We place a minimum bid on the token.
        */
        if (!ourExistingOffer) {

          if (bestOffer && Number(bestOffer.total) > 0) {
            const topOffer = bestOffer.offers[0]
            /*
             * This condition executes where we don't have an existing offer on a token
             * And there's a current offer on that token
             * we outbid the current offer on the token if the calculated bid price is less than our max bid amount
            */
            if (topOffer.buyerPaymentAddress !== buyerPaymentAddress) {
              const currentPrice = topOffer.price
              const bidPrice = currentPrice + (outBidMargin * CONVERSION_RATE)
              if (bidPrice <= maxPrice) {
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                console.log(`OUTBID CURRENT OFFER ${currentPrice} OUR OFFER ${bidPrice} FOR ${collectionSymbol} ${tokenId}`);
                console.log('-----------------------------------------------------------------------------------------------------------------------------');

                try {
                  await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)
                  bidHistory[collectionSymbol].topBids[tokenId] = true
                  bidHistory[collectionSymbol].ourBids[tokenId] = {
                    price: bidPrice,
                    expiration: expiration
                  }
                } catch (error) {
                  console.log(error);
                }
              } else {
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxPrice} FOR ${collectionSymbol} ${tokenId}`);
                console.log('-----------------------------------------------------------------------------------------------------------------------------');

                // add token to skip
              }
            }
          }
          /*
           * This condition executes where we don't have an existing offer on a token
           * and there is no active offer on that token
           * we bid the minimum on that token
          */
          else {
            const bidPrice = Math.max(listedPrice * 0.5, minOffer)

            if (bidPrice <= maxPrice) {

              try {
                await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)
                bidHistory[collectionSymbol].topBids[tokenId] = true
                bidHistory[collectionSymbol].ourBids[tokenId] = {
                  price: bidPrice,
                  expiration: expiration
                }

              } catch (error) {
                console.log(error);
              }
            } else {
              console.log('-----------------------------------------------------------------------------------------------------------------------------');
              console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxPrice} FOR ${collectionSymbol} ${tokenId}`);
              console.log('-----------------------------------------------------------------------------------------------------------------------------');
            }
          }
        }

        /**
         * This block of code handles situations where there exists an offer on the token:
         * It first checks if there's any offer on the token
         * If an offer is present, it determines whether we have the highest offer
         * If we don't have highest offer, it attempts to outbid the current highest offer
         * In case of being the highest offer, it tries to adjust the bid downwards if the difference between our offer and the second best offer exceeds the outbid margin.
         * If our offer stands alone, it ensures that our offer remains at the minimum possible value
         */
        else if (ourExistingOffer) {
          if (bestOffer && Number(bestOffer.total) > 0) {
            const [topOffer, secondTopOffer] = bestOffer.offers
            const bestPrice = topOffer.price

            if (topOffer.buyerPaymentAddress !== buyerPaymentAddress) {
              const offerData = await getOffers(tokenId, buyerTokenReceiveAddress)
              if (offerData && Number(offerData.total) > 0) {
                const offer = offerData.offers[0]

                try {
                  await cancelBid(offer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
                  delete bidHistory[collectionSymbol].ourBids[tokenId]
                  delete bidHistory[collectionSymbol].topBids[tokenId]

                } catch (error) {
                  console.log(error);
                }

              }
              const currentPrice = topOffer.price
              const bidPrice = currentPrice + (outBidMargin * CONVERSION_RATE)

              if (bidPrice <= maxPrice) {
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                console.log(`OUTBID CURRENT OFFER ${currentPrice} OUR OFFER ${bidPrice} FOR ${collectionSymbol} ${tokenId}`);
                console.log('-----------------------------------------------------------------------------------------------------------------------------');

                try {
                  await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)

                  bidHistory[collectionSymbol].topBids[tokenId] = true
                  bidHistory[collectionSymbol].ourBids[tokenId] = {
                    price: bidPrice,
                    expiration: expiration
                  }
                } catch (error) {
                  console.log(error);
                }

              } else {
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxPrice} FOR ${collectionSymbol} ${tokenId}`);
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
              }

            } else {
              if (secondTopOffer) {
                const secondBestPrice = secondTopOffer.price
                const outBidAmount = outBidMargin * CONVERSION_RATE
                if (bestPrice - secondBestPrice > outBidAmount) {
                  const bidPrice = secondBestPrice + outBidAmount

                  try {

                    await cancelBid(topOffer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
                    delete bidHistory[collectionSymbol].ourBids[tokenId]
                    delete bidHistory[collectionSymbol].topBids[tokenId]

                  } catch (error) {
                    console.log(error);
                  }

                  if (bidPrice <= maxPrice) {
                    console.log('-----------------------------------------------------------------------------------------------------------------------------');
                    console.log(`ADJUST OUR CURRENT OFFER ${bestPrice} TO ${bidPrice} FOR ${collectionSymbol} ${tokenId}`);
                    console.log('-----------------------------------------------------------------------------------------------------------------------------');

                    try {

                      await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)

                      bidHistory[collectionSymbol].topBids[tokenId] = true
                      bidHistory[collectionSymbol].ourBids[tokenId] = {
                        price: bidPrice,
                        expiration: expiration
                      }
                    } catch (error) {
                      console.log(error);
                    }
                  } else {
                    console.log('-----------------------------------------------------------------------------------------------------------------------------');
                    console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxPrice} FOR ${collectionSymbol} ${tokenId}`);
                    console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  }
                }
              } else {
                const bidPrice = Math.max(minOffer, listedPrice * 0.5)
                if (bestPrice > bidPrice) {

                  try {
                    await cancelBid(topOffer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
                    delete bidHistory[collectionSymbol].ourBids[tokenId]
                    delete bidHistory[collectionSymbol].topBids[tokenId]
                  } catch (error) {
                    console.log(error);
                  }

                  console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  console.log(`ADJUST OUR CURRENT OFFER ${bestPrice} TO ${bidPrice} FOR ${collectionSymbol} ${tokenId}`);
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');

                  if (bidPrice <= maxPrice) {

                    try {
                      await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)

                      bidHistory[collectionSymbol].topBids[tokenId] = true
                      bidHistory[collectionSymbol].ourBids[tokenId] = {
                        price: bidPrice,
                        expiration: expiration
                      }
                    } catch (error) {
                      console.log(error);
                    }
                  } else {
                    console.log('-----------------------------------------------------------------------------------------------------------------------------');
                    console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxPrice} FOR ${collectionSymbol} ${tokenId}`);
                    console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  }

                }
              }
            }
          }
        }
      })
    )
  } catch (error) {
    throw error
  }

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
  const buyerTokenReceiveAddress = item.receiverWallet ?? TOKEN_RECEIVE_ADDRESS;
  const privateKey = item.fundingWalletWIF ?? PRIVATE_KEY;
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');
  const currentTime = new Date().getTime();
  const expiration = currentTime + (duration * 60 * 1000);
  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string
  const maxPrice = Math.round(maxBid * CONVERSION_RATE)

  if (!bidHistory[collectionSymbol]) {
    bidHistory[collectionSymbol] = {
      topOffers: {},
      ourBids: {},
      topBids: {},
      bottomListings: [],
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
            topOffers: {},
            ourBids: {},
            topBids: {},
            bottomListings: [],
            lastSeenActivity: null
          };
        }
        bidHistory[item.token.collectionSymbol].topBids[item.tokenId] = true
        bidHistory[item.token.collectionSymbol].ourBids[item.tokenId] = { price: item.price, expiration };
      })
    }
    RESTART = false
  }

  try {
    const lastSeenTimestamp = bidHistory[collectionSymbol]?.lastSeenActivity || null;
    const { offers, latestTimestamp, soldTokens } = await getCollectionActivity(
      collectionSymbol,
      lastSeenTimestamp
    );

    bidHistory[collectionSymbol].lastSeenActivity = latestTimestamp

    const ourBids = Object.keys(bidHistory[collectionSymbol].ourBids);
    const latestOffers = offers
      .filter((offer) => ourBids.includes(offer.tokenId))
      .sort((a, b) => b.listedPrice - a.listedPrice)
      .map((item) => ({ collectionSymbol: item.collectionSymbol, tokenId: item.tokenId, buyerPaymentAddress: item.buyerPaymentAddress, price: item.listedPrice, createdAt: new Date(item.createdAt).toISOString() }))
      .reduce((accumulator: Offer[], currentOffer: Offer) => {
        const existingItemIndex = accumulator.findIndex(item => item.tokenId === currentOffer.tokenId);
        if (existingItemIndex !== -1) {
          if (new Date(currentOffer.createdAt).getTime() > new Date(accumulator[existingItemIndex].createdAt).getTime()) {
            accumulator[existingItemIndex] = currentOffer;
          }
        } else {
          accumulator.push(currentOffer);
        }
        return accumulator;
      }, []);

    latestOffers.forEach((item) => {
      const bidPrice = bidHistory[collectionSymbol].ourBids[item.tokenId].price
      if (item.price > bidPrice) {
        bidHistory[collectionSymbol].topOffers[item.tokenId] = {
          price: item.price,
          buyerPaymentAddress: item.buyerPaymentAddress
        }
      }
    })

    const sold = soldTokens
      .filter((offer) => ourBids.includes(offer.tokenId))
      .sort((a, b) => b.listedPrice - a.listedPrice)
      .map((item) => ({ collectionSymbol: item.collectionSymbol, tokenId: item.tokenId, buyerPaymentAddress: item.buyerPaymentAddress, price: item.listedPrice, createdAt: item.createdAt }))
      .reduce((accumulator: Offer[], currentOffer: Offer) => {
        const existingItemIndex = accumulator.findIndex(item => item.tokenId === currentOffer.tokenId);
        if (existingItemIndex !== -1) {
          if (new Date(currentOffer.createdAt).getTime() > new Date(accumulator[existingItemIndex].createdAt).getTime()) {
            accumulator[existingItemIndex] = currentOffer;
          }
        } else {
          accumulator.push(currentOffer);
        }
        return accumulator;
      }, []);

    if (sold.length > 0) {

      for (const token of sold) {
        delete bidHistory[collectionSymbol].ourBids[token.tokenId]
        delete bidHistory[collectionSymbol].topBids[token.tokenId]
        delete bidHistory[collectionSymbol].topOffers[token.tokenId]

      }
    }

    console.log('-------------------------------------------------------------------------------');
    console.log('LATEST OFFERS');
    console.table(latestOffers);
    console.log('-------------------------------------------------------------------------------');

    console.log('-------------------------------------------------------------------------------');
    console.log('SOLD TOKENS');
    console.table(sold);
    console.table(soldTokens)
    console.log('-------------------------------------------------------------------------------');

    const counterOffers = offers
      .filter((offer) => ourBids.includes(offer.tokenId) && offer.buyerPaymentAddress !== buyerPaymentAddress)
      .map((item) => ({ collectionSymbol: item.collectionSymbol, tokenId: item.tokenId, buyerPaymentAddress: item.buyerPaymentAddress, price: item.listedPrice, createdAt: item.createdAt }))

    console.log('-------------------------------------------------------------------------------');
    console.log('NEW COUNTER OFFERS');
    console.table(counterOffers)
    console.log('-------------------------------------------------------------------------------');

    const lastSeenActivity = Date.now()
    bidHistory[collectionSymbol].lastSeenActivity = lastSeenActivity

    if (counterOffers.length > 0) {
      for (const offers of counterOffers) {
        const { tokenId, price: listedPrice } = offers
        const bidPrice = listedPrice + (outBidMargin * CONVERSION_RATE)

        const ourBidPrice = bidHistory[collectionSymbol].ourBids[tokenId].price
        const offerData = await getOffers(tokenId, buyerTokenReceiveAddress)
        if (offerData && offerData.offers && +offerData.total > 0) {
          const offer = offerData.offers[0]

          if (listedPrice > ourBidPrice) {

            try {
              await cancelBid(offer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
              delete bidHistory[collectionSymbol].ourBids[tokenId]
              delete bidHistory[collectionSymbol].topBids[tokenId]
            } catch (error) {
              console.log(error);
            }
            if (bidPrice <= maxPrice) {
              try {
                await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey, collectionSymbol)

                bidHistory[collectionSymbol].ourBids[tokenId] = {
                  price: bidPrice,
                  expiration: expiration
                }
                bidHistory[collectionSymbol].topOffers[tokenId] = {
                  price: bidPrice,
                  buyerPaymentAddress: buyerPaymentAddress
                }
                bidHistory[collectionSymbol].topBids[tokenId] = true

              } catch (error) {
                console.log(error);
              }
            } else {
              console.log('-----------------------------------------------------------------------------------------------------------------------------');
              console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxPrice} FOR ${collectionSymbol} ${tokenId}`);
              console.log('-----------------------------------------------------------------------------------------------------------------------------');
            }
          } else {
            console.log('-----------------------------------------------------------------------------------------------------------------------------');
            console.log(`YOU CURRENTLY HAVE THE HIGHEST OFFER ${ourBidPrice} FOR ${collectionSymbol} ${tokenId}`);
            console.log('-----------------------------------------------------------------------------------------------------------------------------');
          }
        }

      }
    }

  } catch (error) {
    console.log(error);
  }

}

async function startProcessing() {
  // Run processScheduledLoop and processCounterBidLoop for each item concurrently
  await Promise.all(
    collections.map(async (item) => {
      let isScheduledLoopRunning = false;

      // Start processScheduledLoop and processCounterBidLoop loops concurrently for the item
      await Promise.all([
        (async () => {
          while (true) {
            isScheduledLoopRunning = true;
            await processScheduledLoop(item);
            isScheduledLoopRunning = false;
            await delay(item.scheduledLoop || DEFAULT_LOOP);
          }
        })(),
        (async () => {
          await delay(item.scheduledLoop || DEFAULT_LOOP); // Wait for the first scheduled loop delay
          while (true) {
            if (!isScheduledLoopRunning) {
              await processCounterBidLoop(item);
            }
            await delay(item.counterbidLoop || DEFAULT_COUNTER_BID_LOOP_TIME);
          }
        })(),
      ]);
    })
  );
}


startProcessing();


function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


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
): Promise<{ lists: OfferPlaced[]; offers: OfferPlaced[]; soldTokens: OfferPlaced[]; latestTimestamp: number | null }> {
  const url = "https://nfttools.pro/magiceden/v2/ord/btc/activities";
  const params: any = {
    limit: 100,
    collectionSymbol,
    kind: ["list", "offer_placed", "buying_broadcasted", "offer_accepted_broadcasted"],
  };

  try {
    let lists: OfferPlaced[] = [];
    let offers: OfferPlaced[] = [];
    let soldTokens: OfferPlaced[] = [];
    let response;
    let offset = 0;
    let latestTimestamp = lastSeenTimestamp;

    do {
      params.offset = offset;
      response = await limiter.schedule({ priority: 5 }, () =>
        axiosInstance.get(url, { params, headers })
      );

      for (const activity of response.data.activities) {
        const activityTimestamp = new Date(activity.createdAt).getTime();

        if (lastSeenTimestamp !== null && activityTimestamp <= lastSeenTimestamp) {
          // Activity has already been seen, break the loop
          return { lists, offers, soldTokens, latestTimestamp };
        }

        if (activity.kind === "list") {
          lists.push(activity);
        } else if (activity.kind === "offer_placed") {
          offers.push(activity);
        } else if (activity.kind === "buying_broadcasted" || activity.kind === "offer_accepted_broadcasted") {
          soldTokens.push(activity)
        }

        // Update the latestTimestamp with the timestamp of the current activity
        latestTimestamp = activityTimestamp;

        if (lists.length + offers.length === params.limit) {
          break;
        }
      }

      offset += response.data.activities.length;
    } while (lists.length + offers.length < params.limit);

    return { lists, offers, soldTokens, latestTimestamp };
  } catch (error: any) {
    console.error("Error fetching collection activity:", error.response);
    return { lists: [], offers: [], soldTokens: [], latestTimestamp: lastSeenTimestamp };
  }
}

async function cancelBid(offer: IOffer, privateKey: string, collectionSymbol: string, tokenId: string, buyerPaymentAddress: string) {
  try {
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
  } catch (error) {
    console.log(error);
  }
}



function findTokensToCancel(tokens: ITokenData[], ourBids: string[]): string[] {
  const missingBids = ourBids.filter(bid =>
    !tokens.some(token => token.id === bid)
  );
  return missingBids;
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
    const price = Math.round(offerPrice)
    const unsignedOffer = await createOffer(tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, FEE_RATE_TIER)

    console.log({ unsignedOffer });

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

function combineBidsAndListings(userBids: UserBid[], bottomListings: BottomListing[]) {
  const combinedArray = userBids
    .map(bid => {
      const matchedListing = bottomListings.find(listing => listing.id === bid.tokenId);
      if (matchedListing) {
        return {
          bidId: bid.tokenId.slice(-8),
          bottomListingId: matchedListing.id.slice(-8),
          expiration: bid.expiration,
          price: bid.price,
          listedPrice: matchedListing.price
        };
      }
      return null;
    })
    .filter(entry => entry !== null);

  return combinedArray.sort((a: any, b: any) => a.listedPrice - b.listedPrice);
}

interface UserBid {
  collectionSymbol: string;
  tokenId: string;
  price: number;
  expiration: string;
}

interface BottomListing {
  id: string;
  price: number;
}

interface Listing {
  id: string
  price: number
}
export interface CollectionData {
  collectionSymbol: string;
  minBid: number;
  maxBid: number;
  minFloorBid: number;
  maxFloorBid: number;
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


interface Offer {
  collectionSymbol: string;
  tokenId: string;
  buyerPaymentAddress: string;
  price: number;
  createdAt: string;
}


// TOKENS TO CANCEL
// ┌─────────┬─────────────────────────────────────────────────────────────────────────┐
// │ (index) │                                 Values                                  │
// ├─────────┼─────────────────────────────────────────────────────────────────────────┤
// │    0    │ '3d19c12db788dbd8f2ea0fe2704e4c8609fdb9619cc189824a203d2a16ed7691i951'  │
// │    1    │ '6dd462b45bcd6ebea0e7deb2255269c049271751fe6cff6af5690d0a3561b3e6i1149' │
// │    2    │ '6dd462b45bcd6ebea0e7deb2255269c049271751fe6cff6af5690d0a3561b3e6i1148' │
// │    3    │ '3d19c12db788dbd8f2ea0fe2704e4c8609fdb9619cc189824a203d2a16ed7691i139'  │
// │    4    │ 'd694bca7c91d2f977bcb64a41c722bca79d711e7024657f60e107dc5dab86517i131'  │
// │    5    │ '5b13bdbaf478204ede24bb5bfef048f0f218c6f84cf7c4cba8450b6a76ece6bai1028' │
// │    6    │ '39cd37ef304beb83b74d4c28dd908a0c2bc31e6626ec291c810911c305136ae5i1012' │
// │    7    │ '3d19c12db788dbd8f2ea0fe2704e4c8609fdb9619cc189824a203d2a16ed7691i901'  │
// │    8    │ '3d19c12db788dbd8f2ea0fe2704e4c8609fdb9619cc189824a203d2a16ed7691i1350' │
// │    9    │ '68c2b80824383b5f361ee49207bc56ff8af78612b6994c09bd0c0737fcd164f4i1062' │
// │   10    │ '39cd37ef304beb83b74d4c28dd908a0c2bc31e6626ec291c810911c305136ae5i763'  │
// │   11    │ 'a2ebe021cace26ff98de1abd0b455f1778a21ed0ab9c2eea8215ba62aed92f2ai755'  │
// │   12    │ '78604bcb9048f401a8895d6cce43192e06aae3b90fd85bcd50713a6a17b2baeci1140' │
// │   13    │ '04f2a2ecb8f769e5253b73fad143a770af512b246a0c8c792a21db24da2c8d48i1611' │
// └─────────┴─────────────────────────────────────────────────────────────────────────┘