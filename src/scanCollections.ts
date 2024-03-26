import yargs, { Arguments } from "yargs"
import fs from "fs"

import { fetchCollections } from './functions/Collection';
import { retrieveTokens } from './functions/Tokens';
import { getOffers } from './functions/Offer';

interface Options {
  api_key: string;
}

const options = yargs
  .usage(
    'Usage: -a <api_key>'
  )
  .option('a', {
    alias: 'api_key',
    describe: 'NFTTOOLS API Key',
    type: 'string',
    demandOption: true
  }).argv as unknown as Arguments<Options>

const { api_key } = options


async function run() {
  try {
    const collections = await fetchCollections(api_key)
    let count = 0;

    const collectionData = []
    for (const collection of collections) {
      const collectionSymbol = collection.collectionSymbol

      const name = collection.name
      const image = collection.image
      const floorPrice = collection.fp

      const tokens = await retrieveTokens(collectionSymbol, 10)
      const scannedTokens = tokens.length

      console.log({ collectionSymbol, count });


      const tokensWithNoOffers = []
      const tokensWithOffers = []
      let listedMakerFeeBp;

      for (const token of tokens) {
        const tokenId = token?.id
        listedMakerFeeBp = token && token.listedMakerFeeBp ? token.listedMakerFeeBp : 0

        const data = await getOffers(tokenId)
        const highestOffer = data && data.offers.length > 0 && data.offers[0].price ? data.offers[0].price * 0.00000001 : 0;

        if (highestOffer === 0) {
          tokensWithNoOffers.push({ tokenId, highestOffer })
        } else {
          tokensWithOffers.push({ tokenId, highestOffer })
        }
      }

      const offers = tokensWithOffers.map(item => item.highestOffer)
      const totalOffers = offers.reduce((accumulator, currentValue) => {
        return accumulator + currentValue;
      }, 0);

      const averageOffer = isNaN(Number((totalOffers / tokensWithOffers.length).toFixed(6))) ? 0 : Number((totalOffers / tokensWithOffers.length).toFixed(6))
      const tokensWithOffersCount = tokensWithOffers.length
      const tokensWithNoOffersCount = tokensWithNoOffers.length

      const percentageOfTokensWithOffers = tokensWithOffersCount / scannedTokens * 100

      const makerFee = listedMakerFeeBp ? listedMakerFeeBp / 100 / 100 : 0

      const potentialProfit = isNaN(Number((floorPrice - averageOffer - (averageOffer * makerFee)).toFixed(6))) ? 0 : Number((floorPrice - averageOffer - (averageOffer * makerFee)).toFixed(6))

      const riskOrReward = isNaN((averageOffer + (averageOffer * makerFee)) / potentialProfit) ? 0 : (averageOffer + (averageOffer * makerFee)) / potentialProfit

      console.log({
        name,
        collectionSymbol,
        image,
        averageOffer,
        floorPrice,
        listedMakerFeeBp,
        scannedTokens,
        percentageOfTokensWithOffers,
        riskOrReward,
        potentialProfit: +potentialProfit,
        tokensWithNoOffers: tokensWithNoOffersCount,
        tokensWithOffers: tokensWithOffersCount,
        offers
      });


      collectionData.push({
        name,
        collectionSymbol,
        image,
        averageOffer,
        floorPrice,
        listedMakerFeeBp,
        scannedTokens,
        percentageOfTokensWithOffers,
        riskOrReward,
        potentialProfit: +potentialProfit,
        tokensWithNoOffers: tokensWithNoOffersCount,
        tokensWithOffers: tokensWithOffersCount,
        offers
      })
      count += 1
    }

    const collectionJSON = JSON.stringify(collectionData, null, 2);

    fs.writeFile(`${__dirname}/collections.json`, collectionJSON, "utf-8", (err) => {
      if (err) {
        console.error("Error writing JSON to file:", err);
        return;
      }
      console.log(`Wallet created and saved to wallet.json`);
    });


    // write to json
  } catch (error) {
    console.log(error);
  }
}

run()