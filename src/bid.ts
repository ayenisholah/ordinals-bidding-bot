import { config } from "dotenv"
import fs from "fs"
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import PQueue from "p-queue"
import { getBitcoinBalance } from "./utils";
import { ICollectionOffer, IOffer, cancelCollectionOffer, createCollectionOffer, createOffer, getBestCollectionOffer, getBestOffer, getOffers, getUserOffers, retrieveCancelOfferFormat, signCollectionOffer, signData, submitCancelOfferData, submitCollectionOffer, submitSignedOfferOrder } from "./functions/Offer";
import { OfferPlaced, collectionDetails } from "./functions/Collection";
import { ITokenData, getToken, retrieveTokens } from "./functions/Tokens";
import axiosInstance from "./axios/axiosInstance";
import limiter from "./bottleneck";
import WebSocket from 'ws';


config()

const TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
const FUNDING_WIF = process.env.FUNDING_WIF as string;
const DEFAULT_OUTBID_MARGIN = Number(process.env.DEFAULT_OUTBID_MARGIN) || 0.00001
const API_KEY = process.env.API_KEY as string;
const RATE_LIMIT = Number(process.env.RATE_LIMIT) ?? 32
const DEFAULT_OFFER_EXPIRATION = 30
const FEE_RATE_TIER = 'halfHourFee'
const CONVERSION_RATE = 100000000
const network = bitcoin.networks.bitcoin;

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

const DEFAULT_COUNTER_BID_LOOP_TIME = Number(process.env.DEFAULT_COUNTER_BID_LOOP_TIME) ?? 30
const DEFAULT_LOOP = Number(process.env.DEFAULT_LOOP) ?? 30
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
    offerType: 'ITEM' | 'COLLECTION';
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
    highestCollectionOffer?: {
      price: number;
      buyerPaymentAddress: string;
    };
  };
}


const bidHistory: BidHistory = {};


const queue = new PQueue({
  concurrency: 1.5 * RATE_LIMIT
});


let ws: WebSocket;

(async function () {
  try {
    const socketUri = 'wss://wss-mainnet.magiceden.io/CJMw7IPrGPUb13adEQYW2ASbR%2FIWToagGUCr02hWp1oWyLAtf5CS0XF69WNXj0MbO6LEQLrFQMQoEqlX7%2Fny2BP08wjFc9MxzEmM5v2c5huTa3R1DPqGSbuO2TXKEEneIc4FMEm5ZJruhU8y4cyfIDzGqhWDhxK3iRnXtYzI0FGG1%2BMKyx9WWOpp3lLA3Gm2BgNpHHp3wFEas5TqVdJn0GtBrptg8ZEveG8c44CGqfWtEsS0iI8LZDR7tbrZ9fZpbrngDaimEYEH6MgvhWPTlKrsGw%3D%3D'
    ws = new WebSocket(socketUri);
  } catch (error) {
    console.log(error);
  }
})()


async function processScheduledLoop(item: CollectionData) {

  let isWsConnected = false;

  ws.on('open', () => {
    isWsConnected = true;
  });

  ws.on('close', () => {
    console.log('WebSocket connection closed');
    isWsConnected = false;
  });

  const subscriptionMessage = {
    type: 'subscribeCollection',
    constraint: {
      chain: 'bitcoin',
      collectionSymbol: item.collectionSymbol
    }
  };

  console.log('----------------------------------------------------------------------');
  console.log(`START AUTOBID SCHEDULE FOR ${item.collectionSymbol}`);
  console.log('----------------------------------------------------------------------');

  const collectionSymbol = item.collectionSymbol
  const feeSatsPerVbyte = item.feeSatsPerVbyte
  const offerType = item.offerType.toUpperCase()
  const minBid = item.minBid
  const maxBid = item.maxBid
  const bidCount = item.bidCount ?? 20
  const duration = item.duration ?? DEFAULT_OFFER_EXPIRATION
  const outBidMargin = item.outBidMargin ?? DEFAULT_OUTBID_MARGIN
  const buyerTokenReceiveAddress = item.tokenReceiveAddress ?? TOKEN_RECEIVE_ADDRESS;
  const privateKey = item.fundingWalletWIF ?? FUNDING_WIF;
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');

  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

  try {
    balance = await getBitcoinBalance(buyerPaymentAddress)
    const collectionData = await collectionDetails(collectionSymbol)

    if (!bidHistory[collectionSymbol]) {
      bidHistory[collectionSymbol] = {
        offerType: "ITEM",
        topOffers: {},
        ourBids: {},
        topBids: {},
        bottomListings: [],
        lastSeenActivity: null
      };
    }

    if (RESTART) {
      const offerData = await getUserOffers(buyerTokenReceiveAddress)
      if (offerData && offerData.offers.length > 0) {
        const offers = offerData.offers
        offers.forEach((item) => {
          if (!bidHistory[item.token.collectionSymbol]) {
            bidHistory[item.token.collectionSymbol] = {
              offerType: "ITEM",
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

    const maxFloorBid = item.maxFloorBid <= 100 ? item.maxFloorBid : 100
    const minFloorBid = item.minFloorBid

    console.log('--------------------------------------------------------------------------------');
    console.log('BID RANGE AS A PERCENTAGE FLOOR PRICE');

    console.log("MAX PRICE PERCENTAGE OF FLOOR: ", Math.round(maxFloorBid * floorPrice / 100));
    console.log("MIN PRICE PERCENTAGE OF FLOOR: ", Math.round(minFloorBid * floorPrice / 100));
    console.log('--------------------------------------------------------------------------------');


    const minOffer = Math.max(minPrice, Math.round(minFloorBid * floorPrice / 100))
    const maxOffer = Math.min(maxPrice, Math.round(maxFloorBid * floorPrice / 100))


    const userBids = Object.entries(bidHistory).flatMap(([collectionSymbol, bidData]) => {
      return Object.entries(bidData.ourBids).map(([tokenId, bidInfo]) => ({
        collectionSymbol,
        tokenId,
        price: bidInfo.price,
        expiration: new Date(bidInfo.expiration).toISOString(),
      }));
    }).sort((a, b) => a.price - b.price)

    const ourBids = userBids.map((item) => ({ tokenId: item.tokenId, collectionSymbol: item.collectionSymbol })).filter((item) => item.collectionSymbol === collectionSymbol)
    const ourBidsIds = ourBids.map((item) => item.tokenId)

    const collectionBottomBids: CollectionBottomBid[] = tokens.map((item) => ({ tokenId: item.id, collectionSymbol: item.collectionSymbol })).filter((item) => item.collectionSymbol === collectionSymbol)
    const tokensToCancel = findTokensToCancel(collectionBottomBids, ourBids)

    console.log('--------------------------------------------------------------------------------');
    console.log('USER BIDS');
    console.table(userBids)
    console.log('--------------------------------------------------------------------------------');

    const bottomListingBids = combineBidsAndListings(userBids, bottomListings)
    console.log('--------------------------------------------------------------------------------');
    console.log(`BOTTOM LISTING BIDS FOR ${collectionSymbol}`);
    console.table(bottomListingBids)
    console.log('--------------------------------------------------------------------------------');


    console.log('--------------------------------------------------------------------------------');
    console.log(`TOKENS TO CANCEL ${collectionSymbol}`);
    console.table(tokensToCancel)
    console.log('--------------------------------------------------------------------------------');


    if (tokensToCancel.length > 0) {

      await queue.addAll(
        tokensToCancel.map(token => async () => {
          const offerData = await getOffers(token.tokenId, buyerTokenReceiveAddress)
          if (offerData && Number(offerData.total) > 0) {
            const offer = offerData.offers[0]
            await cancelBid(offer, privateKey, collectionSymbol, token.tokenId, buyerPaymentAddress)
          }
          delete bidHistory[collectionSymbol].ourBids[token.tokenId]
          delete bidHistory[collectionSymbol].topBids[token.tokenId]
        })
      )
    }


    if (offerType.toUpperCase() === "ITEM") {
      await queue.addAll(
        bottomListings.map(token => async () => {
          const { id: tokenId, price: listedPrice } = token

          // check offertype
          const bestOffer = await getBestOffer(tokenId);
          const ourExistingOffer = bidHistory[collectionSymbol].ourBids[tokenId]?.expiration > Date.now()
          const currentBidCount = Object.values(bidHistory[collectionSymbol].topBids).length;

          const currentExpiry = bidHistory[collectionSymbol]?.ourBids[tokenId]?.expiration
          const newExpiry = duration * 60 * 1000

          if (currentExpiry - Date.now() > newExpiry) {
            const offerData = await getOffers(tokenId, buyerTokenReceiveAddress)
            const offer = offerData?.offers[0]

            if (offer) {
              await cancelBid(offer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
            }
            delete bidHistory[collectionSymbol].ourBids[tokenId]
            delete bidHistory[collectionSymbol].topBids[tokenId]
          }


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

          // expire bid if configuration has changed and we are not trying to outbid
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
                if (bidPrice <= maxOffer) {
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  console.log(`OUTBID CURRENT OFFER ${currentPrice} OUR OFFER ${bidPrice} FOR ${collectionSymbol} ${tokenId}`);
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');

                  try {
                    const status = await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey)

                    if (status === true) {
                      bidHistory[collectionSymbol].topBids[tokenId] = true
                      bidHistory[collectionSymbol].ourBids[tokenId] = {
                        price: bidPrice,
                        expiration: expiration
                      }
                    }
                  } catch (error) {
                    console.log(error);
                  }
                } else {
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol} ${tokenId}`);
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  delete bidHistory[collectionSymbol].topBids[tokenId]
                  delete bidHistory[collectionSymbol].ourBids[tokenId]
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

              if (bidPrice <= maxOffer) {
                try {
                  const status = await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey)
                  if (status === true) {
                    bidHistory[collectionSymbol].topBids[tokenId] = true
                    bidHistory[collectionSymbol].ourBids[tokenId] = {
                      price: bidPrice,
                      expiration: expiration
                    }
                  }

                } catch (error) {
                  console.log(error);
                }
              } else {
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol} ${tokenId}`);
                console.log('-----------------------------------------------------------------------------------------------------------------------------');

                delete bidHistory[collectionSymbol].topBids[tokenId]
                delete bidHistory[collectionSymbol].ourBids[tokenId]
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

                if (bidPrice <= maxOffer) {
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  console.log(`OUTBID CURRENT OFFER ${currentPrice} OUR OFFER ${bidPrice} FOR ${collectionSymbol} ${tokenId}`);
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');

                  try {
                    const status = await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey)

                    if (status === true) {
                      bidHistory[collectionSymbol].topBids[tokenId] = true
                      bidHistory[collectionSymbol].ourBids[tokenId] = {
                        price: bidPrice,
                        expiration: expiration
                      }
                    }
                  } catch (error) {
                    console.log(error);
                  }

                } else {
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol} ${tokenId}`);
                  console.log('-----------------------------------------------------------------------------------------------------------------------------');

                  delete bidHistory[collectionSymbol].topBids[tokenId]
                  delete bidHistory[collectionSymbol].ourBids[tokenId]
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

                    if (bidPrice <= maxOffer) {
                      console.log('-----------------------------------------------------------------------------------------------------------------------------');
                      console.log(`ADJUST OUR CURRENT OFFER ${bestPrice} TO ${bidPrice} FOR ${collectionSymbol} ${tokenId}`);
                      console.log('-----------------------------------------------------------------------------------------------------------------------------');

                      try {

                        const status = await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey)

                        if (status === true) {
                          bidHistory[collectionSymbol].topBids[tokenId] = true
                          bidHistory[collectionSymbol].ourBids[tokenId] = {
                            price: bidPrice,
                            expiration: expiration
                          }
                        }
                      } catch (error) {
                        console.log(error);
                      }
                    } else {
                      console.log('-----------------------------------------------------------------------------------------------------------------------------');
                      console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol} ${tokenId}`);
                      console.log('-----------------------------------------------------------------------------------------------------------------------------');

                      delete bidHistory[collectionSymbol].topBids[tokenId]
                      delete bidHistory[collectionSymbol].ourBids[tokenId]
                    }
                  }
                } else {
                  const bidPrice = Math.max(minOffer, listedPrice * 0.5)
                  if (bestPrice !== bidPrice) { // self adjust bids.

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

                    if (bidPrice <= maxOffer) {

                      try {
                        const status = await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey)

                        if (status === true) {
                          bidHistory[collectionSymbol].topBids[tokenId] = true
                          bidHistory[collectionSymbol].ourBids[tokenId] = {
                            price: bidPrice,
                            expiration: expiration
                          }
                        }
                      } catch (error) {
                        console.log(error);
                      }
                    } else {
                      console.log('-----------------------------------------------------------------------------------------------------------------------------');
                      console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol} ${tokenId}`);
                      console.log('-----------------------------------------------------------------------------------------------------------------------------');

                      delete bidHistory[collectionSymbol].topBids[tokenId]
                      delete bidHistory[collectionSymbol].ourBids[tokenId]
                    }

                  } else if (bidPrice > maxOffer) {
                    console.log('\x1b[31m%s\x1b[0m', '🛑 CURRENT PRICE IS GREATER THAN MAX OFFER!!! 🛑');
                    const offerData = await getOffers(tokenId, buyerTokenReceiveAddress)

                    const offer = offerData?.offers[0]

                    if (offer) {
                      await cancelBid(offer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
                    }

                    delete bidHistory[collectionSymbol].ourBids[tokenId]
                    delete bidHistory[collectionSymbol].topBids[tokenId]
                  }
                }
              }
            }
          }
        })
      )
      let counterBidQueue: CollectOfferActivity[] = []
      try {
        const subscriptionMessage = {
          type: 'subscribeCollection',
          constraint: {
            chain: 'bitcoin',
            collectionSymbol: item.collectionSymbol
          }
        };

        if (isWsConnected) {
          ws.send(JSON.stringify(subscriptionMessage));
          ws.on('message', async (data: WebSocket.Data) => {
            if (isValidJSON(data.toString())) {
              const message: CollectOfferActivity = JSON.parse(data.toString());

              const tokenId = message.tokenId;
              if (message.kind === "offer_placed" && ourBidsIds.includes(tokenId) && message.buyerPaymentAddress !== buyerPaymentAddress) {
                if (!counterBidQueue.some((item) => item.tokenId === message.tokenId)) {
                  counterBidQueue.push(message)
                }
                processCounterBidQueue(counterBidQueue);
              }
            }
          });

          async function processCounterBidQueue(counterBidQueue: CollectOfferActivity[]) {
            const counterOffers = counterBidQueue.map((item) => ({ listedPrice: item.listedPrice, tokenId: item.tokenId, buyerPaymentAddress: item.buyerPaymentAddress, createdAt: item.createdAt }))
            console.log('--------------------------------------------------------------------------');
            console.log('COUNTER OFFERS FOUND VIA WEB SOCKET');
            console.table(counterOffers);
            console.log('--------------------------------------------------------------------------');

            queue.addAll(
              counterBidQueue.map((offer) => async () => {
                const { tokenId, listedPrice, buyerPaymentAddress } = offer

                const bidPrice = +listedPrice + (outBidMargin * CONVERSION_RATE)
                const ourBidPrice = bidHistory[collectionSymbol]?.ourBids[tokenId]?.price
                const offerData = await getOffers(tokenId, buyerTokenReceiveAddress)
                if (offerData && offerData.offers && +offerData.total > 0) {
                  const offer = offerData.offers[0]

                  if (+listedPrice > ourBidPrice) {
                    console.log('-------------------------------------------------------------------------');
                    console.log('COUNTERBIDDING!!!!');
                    console.log('-------------------------------------------------------------------------');

                    try {
                      await cancelBid(offer, privateKey, collectionSymbol, tokenId, buyerPaymentAddress)
                      delete bidHistory[collectionSymbol].ourBids[tokenId]
                      delete bidHistory[collectionSymbol].topBids[tokenId]
                    } catch (error) {
                      console.log(error);
                    }
                    if (bidPrice <= maxOffer) {
                      try {
                        const status = await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, privateKey)
                        if (status === true) {
                          bidHistory[collectionSymbol].topBids[tokenId] = true
                          bidHistory[collectionSymbol].ourBids[tokenId] = {
                            price: bidPrice,
                            expiration: expiration
                          }
                        }

                      } catch (error) {
                        console.log(error);
                      }
                    } else {
                      console.log('-----------------------------------------------------------------------------------------------------------------------------');
                      console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol} ${tokenId}`);
                      console.log('-----------------------------------------------------------------------------------------------------------------------------');
                      delete bidHistory[collectionSymbol].topBids[tokenId]
                      delete bidHistory[collectionSymbol].ourBids[tokenId]
                    }
                  } else {
                    console.log('-----------------------------------------------------------------------------------------------------------------------------');
                    console.log(`YOU CURRENTLY HAVE THE HIGHEST OFFER ${ourBidPrice} FOR ${collectionSymbol} ${tokenId}`);
                    console.log('-----------------------------------------------------------------------------------------------------------------------------');
                  }
                }
                counterBidQueue = counterBidQueue.filter(item => item.tokenId !== tokenId);
              })
            )
          }
        }
      } catch (error) {
        console.log(error);
      }
    } else if (offerType.toUpperCase() === "COLLECTION") {

      const bestOffer = await getBestCollectionOffer(collectionSymbol)
      if (bestOffer && bestOffer.offers.length > 0) {

        const [topOffer, secondTopOffer] = bestOffer.offers
        const bestPrice = topOffer.price.amount

        bidHistory[collectionSymbol].highestCollectionOffer = {
          price: bestPrice,
          buyerPaymentAddress: topOffer.btcParams.makerPaymentAddress
        };

        const ourOffer = bestOffer.offers.find((item) => item.btcParams.makerPaymentAddress.toLowerCase() === buyerPaymentAddress.toLowerCase()) as ICollectionOffer

        if (topOffer.btcParams.makerPaymentAddress !== buyerPaymentAddress) {
          try {


            if (ourOffer) {
              const offerIds = [ourOffer.id]
              await cancelCollectionOffer(offerIds, publicKey, privateKey)
            }
          } catch (error) {
            console.log(error);
          }


          const currentPrice = topOffer.price.amount
          const bidPrice = currentPrice + (outBidMargin * CONVERSION_RATE)
          if (bidPrice <= maxOffer && bidPrice < floorPrice) {
            console.log('-----------------------------------------------------------------------------------------------------------------------------');
            console.log(`OUTBID CURRENT COLLECTION OFFER ${currentPrice} OUR OFFER ${bidPrice} FOR ${collectionSymbol}`);
            console.log('-----------------------------------------------------------------------------------------------------------------------------');

            try {
              await placeCollectionBid(bidPrice, expiration, collectionSymbol, buyerTokenReceiveAddress, publicKey, privateKey, feeSatsPerVbyte)
              bidHistory[collectionSymbol].offerType = "COLLECTION"

              bidHistory[collectionSymbol].highestCollectionOffer = {
                price: bidPrice,
                buyerPaymentAddress: buyerPaymentAddress
              }

            } catch (error) {
              console.log(error);
            }

          } else {
            console.log('-----------------------------------------------------------------------------------------------------------------------------');
            console.log(`CALCULATED COLLECTION OFFER PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol}`);
            console.log('-----------------------------------------------------------------------------------------------------------------------------');
          }

        } else {
          if (secondTopOffer) {
            const secondBestPrice = secondTopOffer.price.amount
            const outBidAmount = outBidMargin * CONVERSION_RATE
            if (bestPrice - secondBestPrice > outBidAmount) {
              const bidPrice = secondBestPrice + outBidAmount

              try {
                if (ourOffer) {
                  const offerIds = [ourOffer.id]
                  await cancelCollectionOffer(offerIds, publicKey, privateKey)
                }

              } catch (error) {
                console.log(error);
              }

              if (bidPrice <= maxOffer && bidPrice < floorPrice) {
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                console.log(`ADJUST OUR CURRENT COLLECTION OFFER ${bestPrice} TO ${bidPrice} FOR ${collectionSymbol}`);
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                try {

                  await placeCollectionBid(bidPrice, expiration, collectionSymbol, buyerTokenReceiveAddress, publicKey, privateKey, feeSatsPerVbyte)
                  bidHistory[collectionSymbol].offerType = "COLLECTION"
                  bidHistory[collectionSymbol].highestCollectionOffer = {
                    price: bidPrice,
                    buyerPaymentAddress: buyerPaymentAddress
                  }
                } catch (error) {
                  console.log(error);
                }
              } else {
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                console.log(`CALCULATED COLLECTION OFFER PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol}`);
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
              }
            }
          } else {
            const bidPrice = minOffer
            if (bestPrice !== bidPrice) {
              try {
                if (ourOffer) {
                  const offerIds = [ourOffer.id]
                  await cancelCollectionOffer(offerIds, publicKey, privateKey)
                }
              } catch (error) {
                console.log(error);
              }

              console.log('-----------------------------------------------------------------------------------------------------------------------------');
              console.log(`ADJUST OUR CURRENT COLLECTION OFFER ${bestPrice} TO ${bidPrice} FOR ${collectionSymbol} `);
              console.log('-----------------------------------------------------------------------------------------------------------------------------');

              if (bidPrice <= maxOffer && bidPrice < floorPrice) {

                try {
                  await placeCollectionBid(bidPrice, expiration, collectionSymbol, buyerTokenReceiveAddress, publicKey, privateKey, feeSatsPerVbyte)
                  bidHistory[collectionSymbol].offerType = "COLLECTION"
                  bidHistory[collectionSymbol].highestCollectionOffer = {
                    price: bidPrice,
                    buyerPaymentAddress: buyerPaymentAddress
                  }
                } catch (error) {
                  console.log(error);
                }
              } else {
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
                console.log(`CALCULATED BID PRICE ${bidPrice} IS GREATER THAN MAX BID ${maxOffer} FOR ${collectionSymbol}`);
                console.log('-----------------------------------------------------------------------------------------------------------------------------');
              }

            }
          }
        }
      } else {
        const bidPrice = minOffer
        if (bidPrice <= maxOffer && bidPrice < floorPrice) {
          await placeCollectionBid(bidPrice, expiration, collectionSymbol, buyerTokenReceiveAddress, publicKey, privateKey, feeSatsPerVbyte)
          bidHistory[collectionSymbol].offerType = "COLLECTION"

          bidHistory[collectionSymbol].highestCollectionOffer = {
            price: bidPrice,
            buyerPaymentAddress: buyerPaymentAddress
          }
        }
      }

      const counterBidQueue: CollectOfferActivity[] = []

      if (isWsConnected) {
        ws.send(JSON.stringify(subscriptionMessage));
        ws.on('message', async (data: WebSocket.Data) => {
          try {
            if (isValidJSON(data.toString())) {
              const message: CollectOfferActivity = JSON.parse(data.toString());

              // GET ONLY COLLECTION OFFERS

              if (message.kind === 'coll_offer_created') {
                counterBidQueue.push(message)
                processCounterBidQueue(counterBidQueue);
              }

              async function processCounterBidQueue(counterBidQueue: CollectOfferActivity[]) {

                queue.addAll(counterBidQueue.map((offer) => async () => {
                  const { listedPrice } = offer

                  // GET CURRENT HIGHEST COLLECTION OFFER DETAILS
                  const currentHighestCollectionOfferPrice = bidHistory[collectionSymbol].highestCollectionOffer?.price

                  const ownerOfHighestOffer = bidHistory[collectionSymbol].highestCollectionOffer?.buyerPaymentAddress


                  // CHECK IF NEW COLLECTION OFFER PRICE IS GREATER THAN HIGHEST COLLECT OFFER

                  if (!currentHighestCollectionOfferPrice) {
                    // bid minimum
                    const outBidMargin = item.outBidMargin ?? DEFAULT_OUTBID_MARGIN
                    const outBidAmount = outBidMargin * CONVERSION_RATE
                    const bidPrice = outBidAmount + Number(listedPrice)

                    // BID
                    await placeCollectionBid(bidPrice, expiration, collectionSymbol, buyerTokenReceiveAddress, publicKey, privateKey, feeSatsPerVbyte)
                    bidHistory[collectionSymbol].offerType = "COLLECTION"

                    // UPDATE RECORD
                    bidHistory[collectionSymbol].highestCollectionOffer = {
                      price: bidPrice,
                      buyerPaymentAddress: buyerPaymentAddress
                    }
                  }
                  else if (currentHighestCollectionOfferPrice && +listedPrice > currentHighestCollectionOfferPrice) {
                    // IF WE DONE OWN THE INCOMING HIGHEST COLLECTION OFFER, OUTBID
                    if (ownerOfHighestOffer !== buyerPaymentAddress) {
                      const outBidMargin = item.outBidMargin ?? DEFAULT_OUTBID_MARGIN
                      const outBidAmount = outBidMargin * CONVERSION_RATE
                      const bidPrice = outBidAmount + Number(listedPrice)

                      // OUTBID
                      await placeCollectionBid(bidPrice, expiration, collectionSymbol, buyerTokenReceiveAddress, publicKey, privateKey, feeSatsPerVbyte)
                      bidHistory[collectionSymbol].offerType = "COLLECTION"

                      // UPDATE RECORD
                      bidHistory[collectionSymbol].highestCollectionOffer = {
                        price: bidPrice,
                        buyerPaymentAddress: buyerPaymentAddress
                      }
                    }
                  }
                }))
              }
            }

          } catch (error) {
          }
        });
      }
    }
  } catch (error) {
    throw error
  }

}


async function processCounterBidLoop(item: CollectionData, ws: WebSocket) {
  console.log('----------------------------------------------------------------------');
  console.log(`START COUNTERBID SCHEDULE FOR ${item.collectionSymbol}`);
  console.log('----------------------------------------------------------------------');

  const collectionSymbol = item.collectionSymbol
  const feeSatsPerVbyte = item.feeSatsPerVbyte
  const offerType = item.offerType.toUpperCase()
  const maxBid = item.maxBid
  const minBid = item.minBid
  const bidCount = item.bidCount ?? 20
  const duration = item.duration ?? DEFAULT_OFFER_EXPIRATION
  const outBidMargin = item.outBidMargin ?? DEFAULT_OUTBID_MARGIN
  const buyerTokenReceiveAddress = item.tokenReceiveAddress ?? TOKEN_RECEIVE_ADDRESS;
  const privateKey = item.fundingWalletWIF ?? FUNDING_WIF;
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');
  const currentTime = new Date().getTime();
  const expiration = currentTime + (duration * 60 * 1000);
  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string
  const maxPrice = Math.round(maxBid * CONVERSION_RATE)


  const minPrice = Math.round(minBid * CONVERSION_RATE)
  const minFloorBid = item.minFloorBid



  if (!bidHistory[collectionSymbol]) {
    bidHistory[collectionSymbol] = {
      offerType: "ITEM",
      topOffers: {},
      ourBids: {},
      topBids: {},
      bottomListings: [],
      lastSeenActivity: null
    };
  }

  if (RESTART) {
    const offerData = await getUserOffers(buyerTokenReceiveAddress)
    if (offerData && offerData.offers.length > 0) {
      const offers = offerData.offers
      offers.forEach((item) => {
        if (!bidHistory[item.token.collectionSymbol]) {
          bidHistory[item.token.collectionSymbol] = {
            offerType: "ITEM",
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

  if (offerType === "ITEM") {
    try {
      balance = await getBitcoinBalance(buyerPaymentAddress)
      const collectionData = await collectionDetails(collectionSymbol)
      const floorPrice = Number(collectionData?.floorPrice) ?? 0
      const maxFloorBid = item.maxFloorBid <= 100 ? item.maxFloorBid : 100
      const maxOffer = Math.max(maxPrice, Math.round(maxFloorBid * floorPrice / 100))

      const lastSeenTimestamp = bidHistory[collectionSymbol]?.lastSeenActivity || null;
      const { offers, latestTimestamp, soldTokens } = await getCollectionActivity(
        collectionSymbol,
        lastSeenTimestamp
      );

      bidHistory[collectionSymbol].lastSeenActivity = latestTimestamp
      const ourBids = Object.keys(bidHistory[collectionSymbol].ourBids);

      const latestOffers = offers
        .filter((offer) => ourBids.includes(offer.tokenId))
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
      console.log(`LATEST OFFERS ${collectionSymbol}`);
      console.table(latestOffers);
      console.log('-------------------------------------------------------------------------------');

      console.log('-------------------------------------------------------------------------------');
      console.log(`SOLD TOKENS ${collectionSymbol}`);
      console.table(sold);
      console.log('-------------------------------------------------------------------------------');

      const bottomListings = bidHistory[collectionSymbol].bottomListings


      const userBids = Object.entries(bidHistory).flatMap(([collectionSymbol, bidData]) => {
        return Object.entries(bidData.ourBids).map(([tokenId, bidInfo]) => ({
          collectionSymbol,
          tokenId,
          price: bidInfo.price,
          expiration: new Date(bidInfo.expiration).toISOString(),
        }));
      }).sort((a, b) => a.price - b.price)

      const bottomListingBids = combineBidsAndListings(userBids, bottomListings)
      const bottomBids = bottomListingBids.map((item) => item?.bidId)

      const counterOffers = offers
        .filter((offer) =>
          ourBids.includes(offer.tokenId)
          && offer.buyerPaymentAddress !== buyerPaymentAddress)
        .filter((offer) => bottomBids.includes(offer.tokenId))
        .map((item) => ({ collectionSymbol: item.collectionSymbol, tokenId: item.tokenId, buyerPaymentAddress: item.buyerPaymentAddress, price: item.listedPrice, createdAt: item.createdAt }))

      console.log('-------------------------------------------------------------------------------');
      console.log('NEW COUNTER OFFERS');
      console.table(counterOffers)
      console.log('-------------------------------------------------------------------------------');

      const lastSeenActivity = Date.now()
      bidHistory[collectionSymbol].lastSeenActivity = lastSeenActivity

    } catch (error) {
      console.log(error);
    }
  }

  else if (offerType === "COLLECTION") {
    console.log('-------------------------------------------------------------------------');
    console.log(`COLLECTION OFFER COUNTER BID SCHEDULE FOR ${collectionSymbol}`);
    console.log('-------------------------------------------------------------------------');

    let counterBidQueue: CollectOfferActivity[] = []

    try {

    } catch (error) {
      console.log(error);
    }

  }
}


async function startProcessing() {
  await Promise.all(
    collections.map(async (item) => {
      let mutex = new Mutex();

      while (true) {
        await mutex.acquire();
        await processScheduledLoop(item);
        mutex.release();
        await delay((item.scheduledLoop || DEFAULT_LOOP) * 1000);
      }
    })
  );
}

class Mutex {
  private locked: boolean;
  private waitQueue: (() => void)[];

  constructor() {
    this.locked = false;
    this.waitQueue = [];
  }

  async acquire() {
    if (this.locked) {
      await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    }
    this.locked = true;
  }

  release() {
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift();
      resolve?.();
    } else {
      this.locked = false;
    }
  }
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

        if (lastSeenTimestamp !== null && activityTimestamp <= (lastSeenTimestamp - 10 * 1000)) {
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

        if (lists.length + offers.length === params.limit) {
          break;
        }
      }

      offset += response.data.activities.length;
    } while (lists.length + offers.length < params.limit);

    if (response.data.activities.length > 0) {
      latestTimestamp = new Date(response.data.activities[0].createdAt).getTime();
    }

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



function findTokensToCancel(tokens: CollectionBottomBid[], ourBids: { tokenId: string, collectionSymbol: string }[]): {
  tokenId: string;
  collectionSymbol: string;
}[] {

  const missingBids = ourBids.filter(bid =>
    !tokens.some(token => token.tokenId === bid.tokenId && token.collectionSymbol === bid.collectionSymbol)
  );
  return missingBids;
}

interface CollectionBottomBid {
  tokenId: string;
  collectionSymbol: string
}

async function placeBid(
  tokenId: string,
  offerPrice: number,
  expiration: number,
  buyerTokenReceiveAddress: string,
  buyerPaymentAddress: string,
  publicKey: string,
  privateKey: string,
) {
  try {
    const price = Math.round(offerPrice)
    const unsignedOffer = await createOffer(tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, FEE_RATE_TIER)
    const signedOffer = await signData(unsignedOffer, privateKey)
    if (signedOffer) {
      await submitSignedOfferOrder(signedOffer, tokenId, offerPrice, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, FEE_RATE_TIER)
      return true
    }

  } catch (error) {
    console.log(error);
    return false
  }
}

async function placeCollectionBid(
  offerPrice: number,
  expiration: number,
  collectionSymbol: string,
  buyerTokenReceiveAddress: string,
  publicKey: string,
  privateKey: string,
  feeSatsPerVbyte: number = 28,
) {
  const priceSats = Math.ceil(offerPrice)
  const expirationAt = new Date(expiration).toISOString();

  const unsignedCollectionOffer = await createCollectionOffer(collectionSymbol, priceSats, expirationAt, feeSatsPerVbyte, publicKey, buyerTokenReceiveAddress)
  if (unsignedCollectionOffer) {
    const { signedOfferPSBTBase64, signedCancelledPSBTBase64 } = signCollectionOffer(unsignedCollectionOffer, privateKey)
    await submitCollectionOffer(signedOfferPSBTBase64, signedCancelledPSBTBase64, collectionSymbol, priceSats, expirationAt, publicKey, buyerTokenReceiveAddress)
  }

}

function isValidJSON(str: string) {
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
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
  enableCounterBidding: boolean;
  fundingWalletWIF?: string;
  tokenReceiveAddress?: string;
  scheduledLoop?: number;
  offerType: "ITEM" | "COLLECTION";
  feeSatsPerVbyte?: number;
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


interface CollectOfferActivity {
  createdAt: string;
  kind: string;
  tokenId: string;
  listedPrice: string | number;
  sellerPaymentReceiverAddress: string;
  tokenInscriptionNumber: string;
  tokenSatRarity: string;
  tokenSatBlockHeight: number;
  tokenSatBlockTime: string;
  collectionSymbol: string;
  chain: string;
  newOwner: string;
  brc20TransferAmt: null; // Change this to the appropriate type if not always null
  brc20ListedUnitPrice: null; // Change this to the appropriate type if not always null
  btcUsdPrice: number;
  oldLocation: string;
  oldOwner: string;
  buyerPaymentAddress: string;
  listedMakerFeeBp: number;
  listedTakerFeeBp: number;
  reasonForActivity: string;
}
