import { config } from "dotenv"
import fs from "fs"
import * as bitcoin from "bitcoinjs-lib";
import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import Bottleneck from "bottleneck"
import PQueue from "p-queue"
import { getBitcoinBalance } from "./utils";
import { cancelBulkTokenOffers, counterBid, createOffer, getBestOffer, getOffers, signData, submitSignedOfferOrder } from "./functions/Offer";
import { Token, collectionActivity, collectionDetails } from "./functions/Collection";
import sequelize from "./database";
import Offer from "./models/offer.model";
import { activityStream } from "./activity";

config()

let TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
let PRIVATE_KEY = process.env.PRIVATE_KEY as string;

const API_KEY = process.env.API_KEY as string;
const network = bitcoin.networks.bitcoin;

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

let keyPair: ECPairInterface = ECPair.fromWIF(PRIVATE_KEY, network);
let buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string
const DEFAULT_COUNTER_BID_LOOP_TIME = 180 // seconds
let RESTART = true;

async function dbConnect() {
  try {
    await sequelize.authenticate()
    await sequelize.sync({ alter: true })
  } catch (error) {
    console.log(error);
  }
}

const limiter = new Bottleneck({
  minTime: 250, // 4 requests per second
});


dbConnect().then(() => console.log('DATABASE CONNECTED SUCCESSFULLY!')).catch(error => console.log(error))

const filePath = `${__dirname}/collections.json`
const collections: CollectionData[] = JSON.parse(fs.readFileSync(filePath, "utf-8"))


async function main() {
  console.log('--------------------------------------------------------------------------------');
  console.log('RESTART:', RESTART);
  console.log('--------------------------------------------------------------------------------');

  try {
    const DEFAULT_OUTBID_MARGIN = 0.00001
    const DEFAULT_OFFER_EXPIRATION = 30
    const feerateTier = 'halfHourFee'

    for (const collection of collections) {
      const collectionSymbol = collection['collectionSymbol']
      const minBid = collection['minBid']
      const maxBid = collection['maxBid']
      const bidCount = collection['bidCount'] ?? 20
      const duration = collection.duration ?? DEFAULT_OFFER_EXPIRATION
      const counterbid = collection['counterbid'] ?? false
      const fundingWalletWIF = collection['fundingWalletWIF']
      const receiverWallet = collection['receiverWallet']
      const outBidMargin = collection['outBidMargin'] ?? DEFAULT_OUTBID_MARGIN

      const buyerTokenReceiveAddress = receiverWallet ? receiverWallet : TOKEN_RECEIVE_ADDRESS
      const privateKey = fundingWalletWIF ? fundingWalletWIF : PRIVATE_KEY

      if (!privateKey) {
        console.log('--------------------------------------------------------------------------------');
        console.log("PAYMENT PRIVATE KEY NOT ADDRESS NOT SET");
        console.log('--------------------------------------------------------------------------------');
        continue
      }

      if (RESTART) {
        const offers = await Offer.findAll({})
        const tokenIds = offers.filter(item => item.privateKey === privateKey).map(item => item.id)
        await cancelBulkTokenOffers(tokenIds, buyerTokenReceiveAddress, privateKey)
        RESTART = false
      }


      const keyPair = ECPair.fromWIF(privateKey, network);
      const publicKey = keyPair.publicKey.toString('hex');

      buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string
      const balance = await getBitcoinBalance(buyerPaymentAddress)

      if (!buyerTokenReceiveAddress) {
        console.log('--------------------------------------------------------------------------------');
        console.log("TOKEN RECEIVER ADDRESS NOT SET");
        console.log('--------------------------------------------------------------------------------');
        continue
      }
      console.log('--------------------------------------------------------------------------------');
      console.log(`BUYER PAYMENT ADDRESS: ${buyerPaymentAddress}`);
      console.log(`BUYER TOKEN RECEIVE ADDRESS: ${buyerTokenReceiveAddress}`);
      console.log('--------------------------------------------------------------------------------');

      let tokens: any = []
      const currentTime = new Date().getTime();
      const expiration = currentTime + (duration * 60 * 1000);

      const conversionRate = 100000000
      const minPrice = minBid ? Math.ceil(minBid * conversionRate) : 0
      const maxPrice = maxBid ? Math.ceil(maxBid * conversionRate) : 0

      const collectionData = await collectionDetails(collectionSymbol)
      const floorPrice = collectionData && collectionData.floorPrice ? +collectionData.floorPrice : 0

      console.log('--------------------------------------------------------------------------------');
      console.log(`COLLECTION SYMBOL: ${collectionSymbol}`);
      console.log("MAX PRICE: ", maxPrice);
      console.log("MIN PRICE: ", minPrice);
      console.log("FLOOR PRICE: ", floorPrice);
      console.log('--------------------------------------------------------------------------------');

      let collectionOffers = await collectionActivity(collectionSymbol)

      async function scheduleCollectionActivity() {
        collectionOffers = await collectionActivity(collectionSymbol);
        setTimeout(scheduleCollectionActivity, 1000);
      }

      scheduleCollectionActivity()

      interface IOffer extends Token {
        id: string;
        price: number;
      }

      let offers: IOffer[] = [];

      if (collectionOffers && collectionOffers.activities && collectionOffers.activities.length > 0) {
        offers = collectionOffers.activities.map(item => ({
          id: item.tokenId, listedPrice: item.listedPrice,
          price: item.listedPrice,
          ...item.token
        }))
      }
      console.log('--------------------------------------------------------------------------------');
      console.log({ offers });
      console.log('--------------------------------------------------------------------------------');

      let oldTokens: any[] = [];
      const filePath = `${collectionSymbol}.collection.json`
      try {
        const fileContent = fs.readFileSync(filePath, 'utf-8')
        if (fileContent.length > 0) {
          oldTokens = JSON.parse(fileContent)
        }
      } catch (error) {
        console.log('--------------------------------------------------------------------------------');
        console.log('COLLECTION NOT CACHE');
        console.log('--------------------------------------------------------------------------------');
      }
      const staleTokens = oldTokens.filter(token => !tokens.some((t: any) => t.id === token.id)).map(token => token.id);


      console.log('--------------------------------------------------------------------------------');
      console.log('STALE TOKENS: ', staleTokens);
      console.log('--------------------------------------------------------------------------------');

      if (staleTokens.length > 0) {
        await cancelBulkTokenOffers(staleTokens, buyerTokenReceiveAddress, privateKey)
        console.log('--------------------------------------------------------------------------------');
        console.log(`CANCELLED ALL STALE OFFERS FOR ${collectionSymbol}`);
        console.log('--------------------------------------------------------------------------------');
      }
      const jsonString = JSON.stringify(tokens, null, 2);

      if (tokens.length > 0) {
        fs.writeFile(filePath, jsonString, 'utf-8', (err) => {
          if (err) {
            console.error('Error writing JSON to file:', err);
            return;
          }
          console.log('JSON data has been written to data.json');
        });
      }

      const listedMakerFeeBp = tokens && tokens[0]?.listedMakerFeeBp ? tokens[0]?.listedMakerFeeBp : 0
      const makerFee = listedMakerFeeBp / 100 / 100

      console.log('--------------------------------------------------------------------------------');
      console.log('MAKER FEE: ', makerFee);
      console.log('--------------------------------------------------------------------------------');

      for (const token of tokens) {

        console.log({
          id: token.id,
          price: token.price
        });

        const offer = await getBestOffer(token.id)
        const bestOffer = offer?.offers[0]?.price ?? 0

        console.log('--------------------------------------------------------------------------------');
        console.log('LISTED PRICE : ', token.listedPrice);
        console.log('--------------------------------------------------------------------------------');

        if (bestOffer > 0) {
          console.log('CURRENT HIGHEST OFFER: ', bestOffer);
          console.log('OUTBID MARGIN: ', outBidMargin);
        }

        let offerPrice = Math.ceil(+floorPrice / 2);
        const bidAddress = offer?.offers[0]?.buyerPaymentAddress

        if (bestOffer > 0 && bidAddress !== buyerPaymentAddress) {
          offerPrice = Math.ceil(bestOffer * (1 + (outBidMargin / 100)))
        }

        if (offerPrice < token.listedPrice / 2) {
          offerPrice = Math.ceil((token.listedPrice / 2) * (1 + (outBidMargin / 100)))
        }

        if (offerPrice < minPrice) {
          offerPrice = minPrice
        }

        if (offerPrice > maxPrice) {
          console.log(`OFFER PRICE ${offerPrice} EXCEEDS MAX PRICE ${maxPrice}`);
          continue
        }

        if (offerPrice > balance) {
          console.log(`OFFER PRICE ${offerPrice} EXCEEDS BALANCE ${balance}`);
          continue
        }

        console.log('--------------------------------------------------------------------------------');
        console.log(`BEST OFFER: ${collectionSymbol} ${token.id}`, bestOffer);
        console.log(`OFFER PRICE: `, offerPrice);
        console.log('--------------------------------------------------------------------------------');

        const currentOffer = await getBestOffer(token.id)

        if (currentOffer && currentOffer.offers && currentOffer.offers.length > 0 && currentOffer.offers[0].buyerPaymentAddress === buyerPaymentAddress) {
          console.log('--------------------------------------------------------------------------------');
          console.log('YOU CURRENTLY HAVE THE HIGHEST OFFER FOR THIS TOKEN');
          console.log('--------------------------------------------------------------------------------');
          continue
        } else if (currentOffer && currentOffer.offers && currentOffer.offers.length > 0 && currentOffer.offers[0].buyerPaymentAddress !== buyerPaymentAddress) {
          console.log('--------------------------------------------------------------------------------');
          console.log({ currentOffer: currentOffer.offers[0] });
          console.log('--------------------------------------------------------------------------------');

          console.log('--------------------------------------------------------------------------------');
          console.log(`COUNTER BID FOR ${collectionSymbol} ${token.id}`);
          console.log('--------------------------------------------------------------------------------');

          const userOfferData = await getOffers(token.id, buyerTokenReceiveAddress)
          const currentPrice = ((currentOffer?.offers[0]?.price) as number) + (outBidMargin * conversionRate)

          if (userOfferData && +userOfferData.total > 0) {
            const offer = userOfferData.offers[0]
            await counterBid(offer.id, token.id, currentPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier, privateKey)
          } else {
            const unsignedOffer = await createOffer(token.id, offerPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier)

            console.log('--------------------------------------------------------------------------------');
            console.log({ unsignedOffer });
            console.log('--------------------------------------------------------------------------------');

            const signedOffer = await signData(unsignedOffer, privateKey)

            console.log('--------------------------------------------------------------------------------');
            console.log({ signedOffer });
            console.log('--------------------------------------------------------------------------------');

            const offerData = await submitSignedOfferOrder(signedOffer, token.id, offerPrice, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, feerateTier)

            console.log('--------------------------------------------------------------------------------');
            console.log({ offerData });
            console.log('--------------------------------------------------------------------------------');
          }
        }

        const unsignedOffer = await createOffer(token.id, offerPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier)

        console.log('--------------------------------------------------------------------------------');
        console.log({ unsignedOffer });
        console.log('--------------------------------------------------------------------------------');

        const signedOffer = await signData(unsignedOffer, privateKey)

        console.log('--------------------------------------------------------------------------------');
        console.log({ signedOffer });
        console.log('--------------------------------------------------------------------------------');

        const offerData = await submitSignedOfferOrder(signedOffer, token.id, offerPrice, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, feerateTier)

        console.log('--------------------------------------------------------------------------------');
        console.log({ offerData });
        console.log('--------------------------------------------------------------------------------');

        const offerExist = await Offer.findByPk(token.id)

        const newOffer = {
          id: token.id,
          collectionSymbol: collectionSymbol,
          listedPrice: token.listedPrice,
          listedMakerFeeBp: token.listedMakerFeeBp,
          offerDate: Date.now(),
          bestOffer: bestOffer,
          offerPrice: offerPrice,
          offerCreated: true,
          floorPrice: floorPrice,
          listingCreated: false,
          counterbid: counterbid,
          active: true,
          privateKey: privateKey,
          publicKey: publicKey,
          buyerPaymentAddress: buyerPaymentAddress,
          buyerTokenReceiveAddress: buyerPaymentAddress,
        }

        if (offerExist) {
          await Offer.update(newOffer, {
            where: {
              id: token.id
            }
          })
        } else {
          const saveOffer = await Offer.create(newOffer)
          saveOffer.save()
        }
      }
    }

  } catch (error) {
    throw error
  }
}
main()



interface CollectionData {
  collectionSymbol: string;
  minBid: number;
  maxBid: number;
  outBidMargin: number;
  bidCount: number;
  counterbid: number;
  duration: number;
  fundingWalletWIF?: string;
  receiverWallet?: string;
}


// STOP TIMER
// setTimeout(() => {
//   clearInterval(mainInterval);
//   activityIntervals.forEach(interval => clearInterval(interval));
// }, 3600000);

// const mainInterval = setInterval(main, mainIntervalTime);
// const mainIntervalTime = 60000;
