import { config } from "dotenv"
import fs from "fs"
import * as bitcoin from "bitcoinjs-lib";
import { ECPairFactory, TinySecp256k1Interface } from 'ecpair';
import PQueue from "p-queue"
import { createOffer, getOffers, submitSignedOfferOrder, signData } from "./functions/Offer";
import { collectionDetails } from "./functions/Collection";
import axiosInstance from "./axios/axiosInstance";
import axios from "axios";  // Assuming axios is installed and imported correctly


config()

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const API_KEY = process.env.API_KEY || 'default-api-key'; 
const PRIVATE_KEY = process.env.PRIVATE_KEY || 'default-private-key'; 
const TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS || 'default-token-receive-address';

const NETWORK = bitcoin.networks.bitcoin;
const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair = ECPairFactory(tinysecp);

const headers = {
  'Content-Type': 'application/json',
  'X-NFT-API-Key': API_KEY,
}

interface OfferPlaced {
  createdAt: string;
  listedPrice: number;
  buyerPaymentAddress: string;
}

interface CollectionActivityParams {
  limit: number;
  collectionSymbol: string;
  kind: string[];
  offset?: number;  // Optional property
}

async function getCollectionActivity(
  collectionSymbol: string,
  lastSeenTimestamp: number
): Promise<{ offers: OfferPlaced[], latestTimestamp: number, soldTokens: OfferPlaced[] }> {
  const url = "https://nfttools.pro/magiceden/v2/ord/btc/activities";
  const params: CollectionActivityParams = {
    limit: 100,
    collectionSymbol,
    kind: ["list", "offer_placed", "buying_broadcasted", "offer_accepted_broadcasted"],
  };

  let offers: OfferPlaced[] = [];
  let soldTokens: OfferPlaced[] = [];
  let response;
  let offset = 0;
  let latestTimestamp = lastSeenTimestamp;

  do {
    params.offset = offset;
    response = await axios.get(url, { params, headers: { 'Content-Type': 'application/json', 'X-NFT-API-Key': API_KEY } });

    const currentActivities = response.data.activities.filter((activity: OfferPlaced) => new Date(activity.createdAt).getTime() > lastSeenTimestamp);
    if (currentActivities.length === 0) {
      break; // Exit the loop if no new activities are found
    }

    for (const activity of currentActivities) {
      const activityTimestamp = new Date(activity.createdAt).getTime();
      if (activity.kind === "list") {
        // Assuming list type activities are not required to be stored
      } else if (activity.kind === "offer_placed") {
        offers.push(activity);
        console.log("pushed offer")
      } else if (activity.kind === "buying_broadcasted" || activity.kind === "offer_accepted_broadcasted") {
        soldTokens.push(activity);
      }

      latestTimestamp = Math.max(latestTimestamp, activityTimestamp); // Update the latest seen timestamp
    }

    offset += params.limit; // Increment offset by the limit to fetch the next batch of activities
  } while (true); // Continue until there are no more new activities

  return { offers, latestTimestamp, soldTokens };
}

async function placeSingleBid(tokenId: string, bidAmount: number) {
  const keyPair = ECPair.fromWIF(PRIVATE_KEY, NETWORK);
  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: NETWORK }).address as string;
  const expiration = new Date().getTime() + (30 * 60 * 1000); // 30 minutes from now

  try {
    const offer = await createOffer(tokenId, bidAmount, expiration, TOKEN_RECEIVE_ADDRESS, buyerPaymentAddress, keyPair.publicKey.toString('hex'), 'halfHourFee');
    const signedOffer = await signData(offer, PRIVATE_KEY);

    if (typeof signedOffer === 'string') {
      await submitSignedOfferOrder(signedOffer, tokenId, bidAmount, expiration, buyerPaymentAddress, TOKEN_RECEIVE_ADDRESS, keyPair.publicKey.toString('hex'), 'halfHourFee');
      console.log('Bid successfully placed and signed.' + new Date().getTime());
    } else {
      console.error('Failed to sign the offer');
      return;
    }

    console.log('Polling for offer visibility...');
    const startPollingTime = new Date().getTime();
    let offerVisible = false;
    let timestamp = new Date().getTime() - 1000;
    while (!offerVisible) {
      const { offers } = await getCollectionActivity('btc_x_puppets', timestamp);
      console.log(offers);
      offerVisible = offers.some(offer => offer.listedPrice == bidAmount && offer.buyerPaymentAddress == buyerPaymentAddress);


      if (offerVisible) {
        const endPollingTime = new Date().getTime();
        console.log(`Bid visible after ${endPollingTime - startPollingTime} ms`);
      } else {
        await delay(500); // Wait for 500 ms before polling again
      }
    }
  } catch (error) {
    console.error('Error placing or checking bid:', error);
  }
}

// Example usage
placeSingleBid("139259f817b008641e8f1df4dbfbd423763ce7f8577c11d7a2ed67de4bf72dc4i0", 35000); // Replace "your-token-id-here" with your specific token ID and bid amount in satoshis
