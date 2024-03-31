
import fs from "fs"
import Bottleneck from "bottleneck"
import PQueue from "p-queue"
import { config } from "dotenv"
import * as bitcoin from "bitcoinjs-lib"
const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
import { ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import axiosInstance from "./axios/axiosInstance";
import { OfferPlaced } from "./functions/Collection";
import { IToken, ITokenData } from "./functions/Tokens";
import { createOffer, getBestOffer, getOffers, retrieveCancelOfferFormat, signData, submitCancelOfferData, submitSignedOfferOrder } from "./functions/Offer";
import { getBitcoinBalance } from "./utils"

config()

const limiter = new Bottleneck({
  minTime: 250,
});

const filePath = `${__dirname}/collections.json`
const collections: CollectionData[] = JSON.parse(fs.readFileSync(filePath, "utf-8"))

const API_KEY = process.env.API_KEY as string;
const DEFAULT_LOOP = 100
const DEFAULT_BID_DURATION = 15
const ECPair: ECPairAPI = ECPairFactory(tinysecp);
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
const DEFAULT_OUTBID_MARGIN = Number(process.env.DEFAULT_OUTBID_MARGIN) || 0.00001
const DEFAULT_COUNTER_BID_LOOP_TIME = 100

const network = bitcoin.networks.bitcoin;

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}

// add this to the database to resume
const collectionData: any = {};

async function getCollectionActivity(
  collectionSymbol: string,
  lastSeenTimestamp = null
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

async function getListedTokens(collectionSymbol: string, bidCount: number = 20) {
  try {
    let offset = 0;
    const limit = bidCount >= 20 ? bidCount : 20
    const url = `https://nfttools.pro/magiceden/v2/ord/btc/tokens`;
    const params = {
      limit: limit,
      offset: offset,
      sortBy: 'priceAsc',
      minPrice: 0,
      maxPrice: 0,
      collectionSymbol: collectionSymbol,
      disablePendingTransactions: true
    };

    let tokens: ITokenData[] = []

    do {
      const { data } = await axiosInstance.get<IToken>(url, { params, headers });
      const filteredTokens = data.tokens.filter(item => item.listed === true)
      offset += filteredTokens.length
      tokens = [...filteredTokens, ...tokens]
    } while (tokens.length < bidCount)

    return tokens.filter(item => item.listed === true)
  } catch (error: any) {
    console.log(error);
    return []
  }
}

async function cancelBid(tokenId: string, buyerTokenReceiveAddress: string, privateKey: string) {
  try {
    const data = await getOffers(tokenId, buyerTokenReceiveAddress)

    if (data && data.offers && data.offers.length > 0) {
      const offer = data.offers[0]
      const offerFormat = await retrieveCancelOfferFormat(offer.id)
      console.log('--------------------------------------------------------------------------------');
      console.log({ offerFormat });
      console.log('--------------------------------------------------------------------------------');

      const signedOfferFormat = signData(offerFormat, privateKey)

      console.log('--------------------------------------------------------------------------------');
      console.log({ signedOfferFormat });
      console.log('--------------------------------------------------------------------------------');

      const cancelData = await submitCancelOfferData(offer.id, signedOfferFormat)

      console.log('--------------------------------------------------------------------------------');
      console.log({ cancelData });
      console.log('--------------------------------------------------------------------------------');

      console.log('--------------------------------------------------------------------------------');
      console.log(`CANCELLED OFFER FOR ${offer.token.collectionSymbol} ${offer.token.id}`);
      console.log('--------------------------------------------------------------------------------');
    }
  } catch (error) {
    console.error(`Error cancelling offer for token ${tokenId}:`, error);
    return null;
  }
}

async function placeBid(tokenId: string, price: number, expiration: number, buyerTokenReceiveAddress: string, buyerPaymentAddress: string, publicKey: string, feerateTier: string, privateKey: string) {

  console.log({
    tokenId,
    price,
    expiration,
    buyerTokenReceiveAddress,
    buyerPaymentAddress,
    publicKey,
    feerateTier,
    privateKey
  });

  console.log('--------------------------------------------------------------------------------');
  console.log(`BIDDING ON ${tokenId} FOR ${price} SATS`);
  console.log('--------------------------------------------------------------------------------');

  console.log('--------------------------------------------------------------------------------');
  console.log(`BUYER TOKEN ADDRESS: ${buyerPaymentAddress}`);
  console.log(`TOKEN RECEIVE ADDRESS: ${buyerTokenReceiveAddress}`);
  console.log('--------------------------------------------------------------------------------');

  try {
    const unsignedOffer = await createOffer(tokenId, price, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier)
    console.log('--------------------------------------------------------------------------------');
    console.log({ unsignedOffer });
    console.log('--------------------------------------------------------------------------------');

    const signedOffer = await signData(unsignedOffer, privateKey)
    console.log('--------------------------------------------------------------------------------');
    console.log({ signedOffer });
    console.log('--------------------------------------------------------------------------------');

    const offerData = await submitSignedOfferOrder(signedOffer, tokenId, price, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, feerateTier)
    console.log('--------------------------------------------------------------------------------');
    console.log({ offerData });
    console.log('--------------------------------------------------------------------------------');

    console.log(`SUCCESSFULLY PLACED BID ON TOKEN ID: ${tokenId}`)
    console.log(`TOKEN RECEIVE ADDRESS: ${buyerTokenReceiveAddress}`);

    return { success: true }

  } catch (error) {
    console.log(error);
  }
}

async function processScheduledLoop(item: CollectionData) {
  console.log('--------------------------------------------------------------------------------');
  console.log(`START AUTOBIDDING SCHEDULE FOR ${item.collectionSymbol}`);
  console.log('--------------------------------------------------------------------------------');

  const privateKey = item.fundingWalletWIF ? item.fundingWalletWIF : PRIVATE_KEY
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');
  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string
  const buyerTokenReceiveAddress = item.receiverWallet ? item.receiverWallet : TOKEN_RECEIVE_ADDRESS
  const duration = item.duration ? item.duration : DEFAULT_BID_DURATION
  const expiration = duration * 60 * 1000
  const feerateTier = 'halfHourFee'
  const outBidMargin = item.outBidMargin ? item.outBidMargin : DEFAULT_OUTBID_MARGIN
  const { collectionSymbol, bidCount, minBid, maxBid } = item;
  const scheduledLoop = item.scheduledLoop ? item.scheduledLoop : DEFAULT_LOOP

  try {
    const listedTokens = await getListedTokens(collectionSymbol);
    const topListings = listedTokens.slice(0, bidCount);

    collectionData[collectionSymbol].topListings = topListings;

    const ratelimit = 4
    const queue = new PQueue({
      concurrency: 1.5 * ratelimit
    });

    await queue.addAll(
      topListings.map((token) => async () => {
        const { id: tokenId, listedPrice } = token;
        const bestOffer = await getBestOffer(tokenId);
        console.log('--------------------------------------------------------------------------------');
        console.log(`BEST OFFER ${JSON.stringify(bestOffer, null, 2)}`);
        console.log('--------------------------------------------------------------------------------');

        const ourExistingOffer = collectionData[collectionSymbol] && collectionData[collectionSymbol].ourBids && collectionData[collectionSymbol].ourBids[tokenId] ?
          collectionData[collectionSymbol].ourBids[tokenId] : null

        console.log({ existingOffer: bestOffer && +bestOffer.total > 0 });


        if (bestOffer && +bestOffer.total > 0) {

          const offer = bestOffer.offers[0]

          const { price: bestPrice } = offer;

          console.log('--------------------------------------------------------------------------------');
          console.log(`BEST OFFER: `, bestPrice);
          console.log('--------------------------------------------------------------------------------');

          const isOurs = offer.buyerPaymentAddress === buyerPaymentAddress

          console.log('--------------------------------------------------------------------------------');
          console.log({ isOurs, offer });
          console.log('--------------------------------------------------------------------------------');

          if (!isOurs && bestPrice >= minBid && bestPrice <= maxBid) {
            if (ourExistingOffer) {
              await cancelBid(tokenId, buyerTokenReceiveAddress, privateKey)
            }
            const currentBidCount = Object.values(
              collectionData[collectionSymbol].topBids
            ).filter(Boolean).length;
            if (currentBidCount < bidCount) {
              const bidPrice = Math.min(bestPrice + outBidMargin, maxBid);
              await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier, privateKey)
              collectionData[collectionSymbol].ourBids[tokenId] = bidPrice;
              collectionData[collectionSymbol].topBids[tokenId] = true;
            }
          }
        } else {
          const currentBidCount = Object.values(
            collectionData[collectionSymbol].topBids
          ).filter(Boolean).length;

          if (currentBidCount < bidCount) {
            if (ourExistingOffer) {
              await cancelBid(tokenId, buyerTokenReceiveAddress, privateKey);
            }
            const bidPrice = Math.max(minBid, listedPrice * 0.5);
            await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier, privateKey);

            if (!collectionData[collectionSymbol]) {
              collectionData[collectionSymbol] = {
                ourBids: {} // Initialize ourBids if it doesn't exist
              };
            } else if (!collectionData[collectionSymbol].ourBids) {
              collectionData[collectionSymbol].ourBids = {}; // Initialize ourBids if it's undefined
            }
            collectionData[collectionSymbol].ourBids[tokenId] = bidPrice;
            collectionData[collectionSymbol].topBids[tokenId] = true;
          }
        }
      })
    );
  } catch (error) {
    console.log(error);
  }


  setTimeout(() => processScheduledLoop(item), scheduledLoop * 1000);
}

async function processCounterBidLoop(item: CollectionData) {
  console.log('----------------------------------------------------------------------------------------------------');
  console.log(`START COUNTER BIDDING SCHEDULE FOR ${item.collectionSymbol}`);
  console.log('----------------------------------------------------------------------------------------------------');

  const { collectionSymbol, bidCount, minBid, maxBid } = item;

  const counterbidLoop = item.counterbidLoop ? item.counterbidLoop : DEFAULT_COUNTER_BID_LOOP_TIME
  const buyerTokenReceiveAddress = item.receiverWallet ? item.receiverWallet : TOKEN_RECEIVE_ADDRESS
  const privateKey = item.fundingWalletWIF ? item.fundingWalletWIF : PRIVATE_KEY
  const duration = item.duration ? item.duration : DEFAULT_BID_DURATION
  const outBidMargin = item.outBidMargin ? item.outBidMargin : DEFAULT_OUTBID_MARGIN
  const expiration = duration * 60 * 1000
  const keyPair = ECPair.fromWIF(privateKey, network);
  const publicKey = keyPair.publicKey.toString('hex');
  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string
  const feerateTier = 'halfHourFee'

  if (!collectionData[collectionSymbol]) {
    collectionData[collectionSymbol] = {
      lastSeenActivity: null,
      topListings: [],
      topBids: {},
    };
  }

  const lastSeenTimestamp = collectionData[collectionSymbol].lastSeenActivity;
  try {
    const balance = await getBitcoinBalance(buyerPaymentAddress);
    console.log('----------------------------------------------------------------------------------------------------');
    console.log('BALANCE: ', balance);
    console.log('----------------------------------------------------------------------------------------------------');

    const activities = await getCollectionActivity(
      collectionSymbol,
      lastSeenTimestamp
    );


    if (activities.length > 0) {
      collectionData[collectionSymbol].lastSeenActivity = new Date(activities[0].createdAt).getTime();
    }

    const offers = activities.filter(
      (activity) => activity.kind === "offer_placed"
    );
    const listings = activities.filter((activity) => activity.kind === "list");

    const uniqueOffers = offers.reduce((acc: OfferPlaced[], offer) => {
      const existingOffer = acc.find((o) => o.tokenId === offer.tokenId);
      if (!existingOffer || offer.listedPrice > existingOffer.listedPrice) {
        acc = acc.filter((o) => o.tokenId !== offer.tokenId);
        acc.push(offer);
      }
      return acc;
    }, []);

    for (const offer of uniqueOffers) {
      const { tokenId, listedPrice: offerPrice } = offer;
      if (collectionData[collectionSymbol].topBids[tokenId]) {
        if (offerPrice >= minBid && offerPrice <= maxBid) {
          const bidPrice = offerPrice + outBidMargin;
          console.log('----------------------------------------------------------------------------------------------------');
          console.log(`COUNTER BID FOR COLLECTION ${collectionSymbol} TOKEN ${tokenId} NEW BID PRICE ${bidPrice} SATS`);
          console.log('----------------------------------------------------------------------------------------------------');
          await cancelBid(tokenId, buyerTokenReceiveAddress, privateKey);
          await placeBid(tokenId, bidPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier, privateKey);
          collectionData[collectionSymbol].topBids[tokenId] = true;
        }
      }
    }

    const uniqueListings = listings.reduce((acc: OfferPlaced[], listing) => {
      if (!acc.some((l) => l.tokenId === listing.tokenId)) {
        acc.push(listing);
      }
      return acc;
    }, []);

    uniqueListings.sort((a, b) => a.listedPrice - b.listedPrice);

    const bottomListings = uniqueListings.slice(0, bidCount);

    const newBottomListings = bottomListings.filter(
      (listing) =>
        !collectionData[collectionSymbol].topListings.some(
          (l: ITokenData) => l.id === listing.tokenId
        )
    );

    if (newBottomListings.length > 0) {
      const tokensToCancel = collectionData[collectionSymbol].topListings
        .filter(
          (listing: ITokenData) => !bottomListings.some((l) => l.tokenId === listing.id)
        )
        .map((listing: ITokenData) => listing.id);

      for (const tokenId of tokensToCancel) {
        await cancelBid(tokenId, buyerTokenReceiveAddress, privateKey);
        delete collectionData[collectionSymbol].topBids[tokenId];
        console.log('----------------------------------------------------------------------------------------------------');
        console.log(`CANCEL BID FOR ${collectionSymbol} ${tokenId}`);
        console.log('----------------------------------------------------------------------------------------------------');
      }

      for (const listing of newBottomListings) {
        if (listing.listedPrice >= minBid && listing.listedPrice <= maxBid) {
          console.log('----------------------------------------------------------------------------------------------------');
          console.log(`PLACE BID FOR NEW BOTTOM TOKENS FOR ${collectionSymbol}`);
          console.log('----------------------------------------------------------------------------------------------------');
          await placeBid(listing.tokenId, listing.listedPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier, privateKey);
          collectionData[collectionSymbol].topBids[listing.tokenId] = true;
        }
      }
      collectionData[collectionSymbol].topListings = bottomListings;
    }

  } catch (error) {
    console.log(error);
  }

  setTimeout(() => processCounterBidLoop(item), counterbidLoop * 1000);
}

collections.forEach((item) => {
  processCounterBidLoop(item);
  processScheduledLoop(item);
});


interface CollectionData {
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
