import { config } from "dotenv"
import fs from "fs"
import path from "path"
import csvParser from "csv-parser";
import { ECPairInterface, ECPairFactory, ECPairAPI, TinySecp256k1Interface } from 'ecpair';
import * as bitcoin from "bitcoinjs-lib"
import { getBitcoinBalance } from "./utils";
import { retrieveTokens } from "./functions/Tokens";
import { createOffer, getBestOffer, signData, submitSignedOfferOrder } from "./functions/Offer";
import { collectionDetails } from "./functions/Collection";
import sequelize from './database';
import Offer from "./models/offer.model";
import Poller from "./services/poller.service";

config()

const tinysecp: TinySecp256k1Interface = require('tiny-secp256k1');
const ECPair: ECPairAPI = ECPairFactory(tinysecp);


const network = bitcoin.networks.bitcoin; // or bitcoin.networks.testnet for testnet

const API_KEY = process.env.API_KEY as string;
const PRIVATE_KEY = process.env.PRIVATE_KEY as string;

const list = "src/offer.csv"

async function main() {

  try {
    await sequelize.authenticate();
    await sequelize.sync({ force: true });

    console.log('Connection has been established successfully.');
  } catch (error) {
    console.error('Unable to connect to the database:', error);
  }

  try {
    const result: ICollection[] = [];
    fs.createReadStream(path.join(__dirname, `../${list}`))
      .pipe(csvParser())
      .on('data', async (data: ICollection) => {
        result.push(data);
      })
      .on('end', async () => {
        console.log(result);
        await offer(result)
      });
  } catch (error) {
    console.log(error);
  }
}

main()

async function offer(collections: ICollection[]) {
  const keyPair: ECPairInterface = ECPair.fromWIF(PRIVATE_KEY, network);
  const publicKey = keyPair.publicKey.toString('hex');
  const buyerPaymentAddress = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey, network: network }).address as string

  const buyerTokenReceiveAddress = process.env.TOKEN_RECEIVE_ADDRESS as string

  console.log('--------------------------------------------------------------------------------');
  console.log(`PUBLIC KEY: ${publicKey}`);
  console.log('--------------------------------------------------------------------------------');

  console.log('--------------------------------------------------------------------------------');
  console.log(`PAYMENT ADDRESS: ${buyerPaymentAddress}`);
  console.log(`TOKEN RECEIEVE ADDRESS: ${buyerTokenReceiveAddress}`);
  console.log('--------------------------------------------------------------------------------');

  try {
    const balance = await getBitcoinBalance(buyerPaymentAddress)

    console.log('--------------------------------------------------------------------------------');
    console.log("BALANCE: ", balance);
    console.log('--------------------------------------------------------------------------------');


    for (const collection of collections) {
      console.log({ collection });
      const collectionSymbol = collection.collectionSymbol
      const bidAllString = collection['bidAll']?.toLowerCase()
      const traits = collection['traits']
      const minProfit = +collection['minProfit']
      const maxProfit = +collection['maxProfit']
      const inscriptionId = collection['inscriptionId']
      const outBidMargin = +collection['outBidMargin']
      const minBid = +collection['minBid']
      const maxBid = +collection['maxBid']
      const duration = 30 // MINUTES


      const currentTime = new Date().getTime();
      const expiration = currentTime + (duration * 60 * 1000);
      const feerateTier = 'halfHourFee'
      let jsonData: any;


      if (traits) {
        jsonData = JSON.parse(traits);
      }

      // const bidAll = bidAllString === 'true' ? true : inscriptionId || traits || jsonData ? true : false

      const bidAll = bidAllString === 'true'

      const conversionRate = 100000000
      const minPrice = minBid ? Math.ceil(minBid * conversionRate) : 0
      const maxPrice = maxBid ? Math.ceil(maxBid * conversionRate) : 0

      const collectionData = await collectionDetails(collectionSymbol)
      const floorPrice = collectionData && collectionData.floorPrice ? +collectionData.floorPrice : 0

      console.log('--------------------------------------------------------------------------------');
      console.log(`COLLECTION SYMBOL: ${collectionSymbol}`);
      console.log("MAX PRICE: ", maxPrice);
      console.log("MIN PRICE: ", minPrice);
      console.log("MAX PROFIT: ", maxProfit);
      console.log("MIN PROFIT: ", minProfit);
      console.log("BID ALL: ", bidAll);
      console.log("FLOOR PRICE: ", floorPrice);
      console.log('--------------------------------------------------------------------------------');

      let tokens = await retrieveTokens(collectionSymbol, bidAll)

      // filter based on traits
      if (traits && jsonData) {
        tokens = tokens.filter(token => {
          return token?.meta?.attributes?.some((attribute: any) => {
            return jsonData.some((item: any) => {
              return item.value === attribute.value && item.trait_type === attribute.trait_type;
            });
          });
        });
      }

      // filter based on inscription id
      if (inscriptionId) {
        tokens = tokens.filter(item => item.id === inscriptionId)
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

      const interval = 5 * 60 * 1000
      const poller = new Poller(interval, publicKey)

      poller.pollOffer(buyerPaymentAddress, buyerTokenReceiveAddress, outBidMargin)

      for (const token of tokens) {

        const url = 'https://nfttools.pro/magiceden/v2/ord/btc/offers/';
        const interval = 5 * 1000
        // const poller = new Poller(interval, api_key);

        // bc1p7zkhwwr054j49l0rk6fjepy034z40fryvg88qmylna05lgssmy3q77uf9y


        const offer = await getBestOffer(token.id)
        const bestOffer = offer?.offers[0]?.price ?? 0

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
    console.log(error);
  }
}

interface ICollection {
  sn: string;
  collectionSymbol: string;
  tokenId: string;
  floor: string;
  bidAll: string;
  traits: string;
  minProfit: number;
  maxProfit: number;
  minBid: number;
  maxBid: number;
  inscriptionId: string
  outBidMargin: string;
}