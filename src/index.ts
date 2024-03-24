import cluster from 'cluster';
import fs from 'fs';
import path from 'path';
import { Bid } from './factory/Bid';

const collectionsData: Collection[] = JSON.parse(fs.readFileSync('collections.json', 'utf8'));

const filePath = path.join(__dirname, '/account/wallet.json');

if (!fs.existsSync(filePath)) {
  console.log('--------------------------------------------------------------------------------');
  console.log("YOU HAVENT CREATED YOUR BIDDING WALLETS, PLEASE RUN THE COMMAND 'yarn account:create'");
  console.log('--------------------------------------------------------------------------------');
  process.exit()
}
const wallets: Wallet[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

const rateLimit = 4
const workers = rateLimit

console.log('--------------------------------------------------------------------------------');
console.log("NUMBER OF WORKERS: ", workers);
console.log('--------------------------------------------------------------------------------');



const collectionsPerWallet = Math.floor(collectionsData.length / workers);
const remainder = collectionsData.length % workers;
const dividedCollections: Collection[][] = [];

let startIndex = 0;
for (let i = 0; i < workers; i++) {
  const chunkSize = i < remainder ? collectionsPerWallet + 1 : collectionsPerWallet;
  dividedCollections.push(collectionsData.slice(startIndex, startIndex + chunkSize));
  startIndex += chunkSize;
}

const walletsWithCollections: { wallet: Wallet; collections: Collection[] }[] = wallets.map((wallet, index) => ({
  wallet,
  collections: dividedCollections[index],
}));

async function processItemWithCollection(wallet: Wallet, collections: Collection[], pid: number) {
  try {
    await Bid(wallet.privateKey, collections, pid)
  } catch (error) {
    console.log(error);
  }
}

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);
  for (let i = 0; i < workers; i++) {
    const worker = cluster.fork();
    const { wallet, collections } = walletsWithCollections[i];
    worker.send({ collections, wallet });
    worker.on('message', (message) => {
      console.log(`Message from worker ${worker.process.pid}: ${message}`);
    });
  }
} else {
  console.log(`Worker ${process.pid} started`);
  process.on('message', ({ collections, wallet }: { collections: Collection[], wallet: Wallet }) => {
    processItemWithCollection(wallet, collections, process.pid);
    if (process.send)
      process.send('Items processed');
  });
}

interface Wallet {
  address: string;
  privateKey: string;
}

interface Collection {
  _id: string;
  name: string;
  collectionSymbol: string;
  image: string;
  averageOffer: number;
  floorPrice: number;
  listedMakerFeeBp: number;
  scannedTokens: number;
  tokensWithOffers: number;
  tokensWithNoOffers: number;
  percentageOfTokensWithOffers: number;
  potentialProfit: number;
  riskOrReward: number;
  offers: number[];
  __v: number;
}