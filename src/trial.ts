import { config } from "dotenv"
import fs from "fs"
import * as bitcoin from "bitcoinjs-lib";
import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import { getBitcoinBalance } from "./utils";
import { ITokenData, getTokenByTraits, retrieveTokens } from "./functions/Tokens";
import { validateTraits } from "./utils/traits.utils";
import Offer from "./models/offer.model";
import { createOffer, getBestOffer, signData, submitSignedOfferOrder } from "./functions/Offer";
import { collectionDetails } from "./functions/Collection";
import Poller from "./services/poller.service";
import sequelize from "./database";


config()

let TOKEN_RECEIVE_ADDRESS = process.env.TOKEN_RECEIVE_ADDRESS as string
let PRIVATE_KEY = process.env.PRIVATE_KEY as string;
const API_KEY = process.env.API_KEY as string;
const network = bitcoin.networks.bitcoin;

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);

let keyPair: ECPairInterface = ECPair.fromWIF(PRIVATE_KEY, network);
let buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string


async function main() {

  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });

    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }

  const filePath = `${__dirname}/offer.json`
  try {
    const balance = await getBitcoinBalance(buyerPaymentAddress)
    const collections = JSON.parse(fs.readFileSync(filePath, "utf-8"))
    const DEFAULT_COUNTER_BID_LOOP_TIME = 10
    const DEFAULT_OUTBID_MARGIN = 5
    const DEFAULT_OFFER_EXPIRATION = 15
    const feerateTier = 'halfHourFee'

    // implement counterbid here
    // update token

    // const poller = new Poller(interval, publicKey)

    //       poller.pollOffer(buyerPaymentAddress, buyerTokenReceiveAddress, outBidMargin)




    for (const collection of collections) {
      const collectionSymbol = collection['collectionSymbol']
      const minBid = collection['minBid']
      const maxBid = collection['minBid']
      const bidCount = collection['bidCount'] ?? 20
      const duration = collection.duration ?? DEFAULT_OFFER_EXPIRATION
      const loop = collection['loop'] ?? DEFAULT_COUNTER_BID_LOOP_TIME
      const counterbid = collection['counterbid'] ?? false
      const fundingWalletWIF = collection['fundingWalletWIF']
      const receiverWallet = collection['receiverWallet']
      const traits = collection['traits']
      const outBidMargin = collection['outBidMargin'] ?? DEFAULT_OUTBID_MARGIN

      const buyerTokenReceiveAddress = receiverWallet ? receiverWallet : TOKEN_RECEIVE_ADDRESS

      // create public key

      const privateKey = fundingWalletWIF ? fundingWalletWIF : PRIVATE_KEY

      if (!privateKey) {
        console.log('--------------------------------------------------------------------------------');
        console.log("PAYMENT PRIVATE KEY NOT ADDRESS NOT SET");
        console.log('--------------------------------------------------------------------------------');
        continue
      }


      const keyPair: ECPairInterface = ECPair.fromWIF(privateKey, network);
      const publicKey = keyPair.publicKey.toString('hex');

      if (!buyerTokenReceiveAddress) {
        console.log('--------------------------------------------------------------------------------');
        console.log("TOKEN RECEIVER ADDRESS NOT SET");
        console.log('--------------------------------------------------------------------------------');
        continue
      }

      let tokens: ITokenData[] = []
      let isTraitValid = false
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


      if (!traits) {
        tokens = await retrieveTokens(collectionSymbol, bidCount)
      }

      if (traits) {
        isTraitValid = validateTraits(traits)
      }

      if (traits && isTraitValid) {
        tokens = await getTokenByTraits(traits, collectionSymbol)
      }

      const jsonString = JSON.stringify(tokens, null, 2);

      fs.writeFile(`${collectionSymbol}.json`, jsonString, 'utf-8', (err) => {
        if (err) {
          console.error('Error writing JSON to file:', err);
          return;
        }
        console.log('JSON data has been written to data.json');
      });

      const listedMakerFeeBp = tokens && tokens[0]?.listedMakerFeeBp ? tokens[0]?.listedMakerFeeBp : 0
      const makerFee = listedMakerFeeBp / 100 / 100

      console.log('--------------------------------------------------------------------------------');
      console.log('MAKER FEE: ', makerFee);
      console.log('--------------------------------------------------------------------------------');


      for (const token of tokens) {

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

        if (currentOffer?.offers[0]?.buyerPaymentAddress === buyerPaymentAddress) {
          console.log('--------------------------------------------------------------------------------');
          console.log('YOU ALREADY HAVE AN OFFER FOR THIS TOKEN');
          console.log('--------------------------------------------------------------------------------');
          continue
        }

        const unsignedOffer = await createOffer(token.id, offerPrice, expiration, buyerTokenReceiveAddress, buyerPaymentAddress, publicKey, feerateTier)

        console.log('--------------------------------------------------------------------------------');
        console.log({ unsignedOffer });
        console.log('--------------------------------------------------------------------------------');

        const signedOffer = await signData(unsignedOffer)

        console.log('--------------------------------------------------------------------------------');
        console.log({ signedOffer });
        console.log('--------------------------------------------------------------------------------');

        const offerData = await submitSignedOfferOrder(signedOffer, token.id, offerPrice, expiration, buyerPaymentAddress, buyerTokenReceiveAddress, publicKey, feerateTier)

        console.log('--------------------------------------------------------------------------------');
        console.log({ offerData });
        console.log('--------------------------------------------------------------------------------');

        const newOffer = {
          id: token.id,
          collectionSymbol: collectionSymbol,
          listedPrice: token.listedPrice,
          listedMakerFeeBp: token.listedMakerFeeBp,
          offerDate: new Date().toISOString(),
          bestOffer: bestOffer,
          offerPrice: offerPrice,
          offerCreated: true,
          floorPrice: floorPrice,
          listed: token.listed,
          listedAt: token.listedAt,
          listingCreated: false,
          traits: traits
        }

        const offerExist = await Offer.findOne({
          where: {
            id: token.id
          }
        })

        if (offerData && offerData.ok) {
          if (offerExist) {
            await Offer.update(newOffer, {
              where: {
                id: token.id
              }
            })
            console.log('--------------------------------------------------------------------------------');
            console.log('UPDATED EXISTING OFFER');
            console.log('--------------------------------------------------------------------------------');
          } else {
            console.log('--------------------------------------------------------------------------------');
            console.log('SAVE NEW OFFER');
            console.log('--------------------------------------------------------------------------------');
            // write to json file
            await Offer.create(newOffer)
          }
        }
      }

    }



  } catch (error) {
    throw error
  }
}

main().catch(error => console.log(error))