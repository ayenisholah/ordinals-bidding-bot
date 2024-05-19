import "dotenv/config";
import axios from "axios";
import axiosRetry from "axios-retry";
import { ethers } from "ethers";
import readline from "readline";
import Bottleneck from "bottleneck";
const listingCount = 1;

axiosRetry(axios, {
	retries: 3,
	retryDelay: async (retryCount, error) => {
		console.log(`Retry attempt ${retryCount}:`);
		console.log("Error details:");
		console.log(
			"  Status:",
			error.response ? error.response.status : "Unknown"
		);
		console.log(
			"  Message:",
			error.response ? error.response.statusText : error.message
		);
		await limiter.schedule(() => Promise.resolve());
		return axiosRetry.exponentialDelay(retryCount);
	},
});

const limiter = new Bottleneck({
	minTime: 333,
});

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const WALLET_ADDRESS = process.env.WALLET_ADDRESS.toLowerCase();
const WALLET_PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const X_NFT_API_KEY = process.env.X_NFT_API_KEY;

// Initialize a wallet (replace with your method to access the wallet)
const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY);

// Initialize web3 with an Ethereum node provider
//const web3 = new Web3(new Web3.providers.HttpProvider(`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`));
const POLL_INTERVAL = 60 * 1000; // 1 minute in milliseconds

let diamondData = {
	current: 0,
	firstRun: 1,
	lastCount: 0,
	lastUpdateTime: null,
	hourlyRate: 0,
	dailyRate: 0,
	weeklyRate: 0,
};

// Function to get the current diamond count from the API
const getDiamondCount = async () => {
	try {
		const apiUrl = `https://nfttools.pro/magiceden/auth/user/0x22706Aea448e97a8805D17991e36292545Bd30Ba?enableSNS=true`;
		let headers = {
			"X-NFT-API-Key": X_NFT_API_KEY,
			Authorization:
				"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhZGRyZXNzIjoiMHgyMjcwNkFlYTQ0OGU5N2E4ODA1RDE3OTkxZTM2MjkyNTQ1QmQzMEJhIiwiaXNzIjoibWFnaWNlZGVuLmlvIiwiaWF0IjoxNzE0MzkyNjYyLCJleHAiOjE3MjIxNjg2NjJ9",
			Cookie:
				"session_ids=%7B%22ids%22%3A%5B%7B%22signature%22%3A%22afIqvr6QpR3NdtJdXI6d-qv-RToMGj3akwYgjGahonI%22%2C%22walletAddress%22%3A%22bc1psa38j966mq2yew7sfyp7c58crmttejhzy9hedsgl4slglfd5wq5q3ytgmg%22%7D%2C%7B%22signature%22%3A%22Zo1J-BrT7KLc6HYk1FVvwp4-x3-D2FBs6D-hz5Jgzf8%22%2C%22walletAddress%22%3A%22bc1ph4cthvtg72lqvrztkz9y7khfahll6pyjlgh7lksvhtzu8gn5qqtqcs0ty7%22%7D%2C%7B%22signature%22%3A%22eYqGTvv2xtHGj1mV8vNjBGd_r5gUwOW_SRBG6wvbU38%22%2C%22walletAddress%22%3A%22bc1p4w334uur7pce35actl5dpm3dt4u97vqzy56ftgcewetcvaj4wk9qe98mdu%22%7D%2C%7B%22signature%22%3A%22OO3R8pogR2sV0zLGCVHM_EhZKOn8ctCJwt6Rxy9Gcoc%22%2C%22walletAddress%22%3A%22bc1pg0zkzgn645qz98dys6h25sdwtmfsneeuawxk63fzz7zsztkp4jyssfgqq5%22%7D%2C%7B%22signature%22%3A%22WLoc-pDiBy9kZj4v04knrcYFRx3b_7CzlhfdbvHuacg%22%2C%22walletAddress%22%3A%220xe61dcC958fc886924f97a1ba7Af2781361f58e7A%22%7D%2C%7B%22signature%22%3A%22payWACufPwQUOMrSnTV3uagNh8VTIwi8YDF_cVYqF34%22%2C%22walletAddress%22%3A%220x46581163dF325d8349C17A749a935df9CDA513E6%22%7D%2C%7B%22signature%22%3A%22tggDV2J8n2-9iHjMW5YnqzSqkTcvXBpLjQb3uLtG810%22%2C%22walletAddress%22%3A%220x22706Aea448e97a8805D17991e36292545Bd30Ba%22%7D%2C%7B%22signature%22%3A%22SUCxpcR-7wfyWI2ZF_Y_opvPQJq7BMuVz-VJi8-6Uz8%22%2C%22walletAddress%22%3A%22bc1pk7yqvx3ewtqn0ycyf8u8ahjgaa8ffzcxwl93c6dalpmxfx0kjj9qj5zqjx%22%7D%2C%7B%22signature%22%3A%22Is0hbRjOhfoUv2wMQEshGR9DGf1NxefdCS-Pj3NvRt4%22%2C%22walletAddress%22%3A%220xCEd86e6c57aD9a65AF5fF46626454F836f86E286%22%7D%5D%7D",
		};
		const response = await limiter.schedule(() =>
			axios.get(apiUrl, { headers })
		);
		const diamondCount = response.data.diamondCount;
		return diamondCount;
	} catch (error) {
		console.error("Failed to fetch diamond count:", error);
		return null;
	}
};

// Function to update the diamond data
const updateDiamondData = async () => {
	const currentDiamondCount = await getDiamondCount();
	console.log(" ");
	console.log("-------------------------------------------------------");
	console.log(`---------------- DIAMOND COUNT CHECK ------------------`);
	console.log("-------------------------------------------------------");

	console.log("Current diamond count:", currentDiamondCount);

	if (currentDiamondCount !== null) {
		const now = Date.now();

		if (diamondData.firstRun === 1) {
			diamondData.lastUpdateTime = now;
			diamondData.lastCount = currentDiamondCount;
			diamondData.firstRun = 0;
		} else {
			const timeElapsed = (now - diamondData.lastUpdateTime) / 60000; // in minutes
			const diamondIncrease = currentDiamondCount - diamondData.lastCount;

			if (diamondIncrease !== 0) {
				diamondData.lastUpdateTime = now;
				sendDiscordAlert(
					`Diamond increase: ${diamondIncrease.toFixed(1)} diamonds`
				);

				console.log(`Diamond increase: ${diamondIncrease.toFixed(1)} diamonds`);
				console.log(`Time elapsed: ${timeElapsed.toFixed(1)} minutes`);

				const ratePerMinute = diamondIncrease / timeElapsed;

				// Update rates
				diamondData.hourlyRate = ratePerMinute * 60; // seconds in an hour
				diamondData.dailyRate = ratePerMinute * 1440; // seconds in a day
				diamondData.weeklyRate = ratePerMinute * 10080; // seconds in a week
			}
			sendDiscordAlert(
				`Time since last update: ${timeElapsed.toFixed(1)} minutes`
			);
			console.log(`Time since last update: ${timeElapsed.toFixed(1)} minutes`);
			sendDiscordAlert(
				`Projected hourly increase: ${diamondData.hourlyRate.toFixed(
					0
				)} diamonds/hour`
			);
			console.log(
				`Projected hourly increase: ${diamondData.hourlyRate.toFixed(
					0
				)} diamonds/hour`
			);
			console.log(
				`Projected daily increase: ${diamondData.dailyRate.toFixed(
					0
				)} diamonds/day`
			);
			console.log(
				`Projected weekly increase: ${diamondData.weeklyRate.toFixed(
					0
				)} diamonds/week`
			);
		}

		// Update last observed data
		diamondData.lastCount = currentDiamondCount;
		console.log("-------------------------------------------------------");
		console.log(" ");
	}
};

// Main function to start the polling
const startPolling = () => {
	updateDiamondData(); // Initial update
	setInterval(updateDiamondData, POLL_INTERVAL); // Poll at regular intervals
};

startPolling();

function pressEnterToContinue() {
	return new Promise((resolve) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
		});

		rl.question("Press Enter to continue...", (answer) => {
			rl.close();
			resolve();
		});
	});
}

// Function to send a Discord alert
async function sendDiscordAlert(message) {
	try {
		await axios.post(DISCORD_WEBHOOK_URL, { content: message });
		console.log("Discord alert sent:", message);
	} catch (error) {
		console.error("Failed to send Discord alert:", error);
	}
}

// Function to fetch the user owned NFTs
async function fetchUserNFTs(address) {
	const apiUrl = `https://nfttools.pro/magiceden/v3/rtp/ethereum/users/${address}/tokens/v9?includeLastSale=true&excludeSpam=true&limit=50&sortBy=acquiredAt&sortDirection=desc&onlyListed=false&normalizeRoyalties=false`;
	let headers = {
		"X-NFT-API-Key": X_NFT_API_KEY,
	};
	try {
		const response = await limiter.schedule(() =>
			axios.get(apiUrl, { headers })
		);
		const tokens = response.data.tokens;
		console.log(`User owned NFTs: ${tokens.length}`);
		return tokens;
	} catch (error) {
		console.error("Failed to user owned NFTs:", error);
		return null;
	}
}

// Function to filter NFTs by collection contract
function filterNFTsByContract(nfts, slug) {
	if (!nfts || nfts.length === 0) {
		console.log("No NFTs provided for filtering.");
		return [];
	}
	const filtered = nfts.filter(
		(nft) => nft.token && nft.token.collection.slug === slug
	);
	//console.log(`Filtered ${filtered.length} NFT(s) that match contract address: ${contractAddress}`);
	return filtered;
}

// Function to list an NFT
async function listNFT(params) {
	//console.log('Listing NFT with the following parameters:');
	//console.log(params);
	//await pressEnterToContinue();

	const listEndpoint =
		"https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/list/v5";
	const signEndpoint =
		"https://nfttools.pro/magiceden/v3/rtp/ethereum/order/v4";
	let headers = {
		"X-NFT-API-Key": X_NFT_API_KEY,
	};

	try {
		// Step 1: Start the listing process
		const listResponse = await limiter.schedule(() =>
			axios.post(
				listEndpoint,
				{
					maker: params.maker,
					source: "magiceden.io",
					params: [
						{
							token: `${params.tokenAddress}:${params.tokenId}`,
							weiPrice: params.weiPrice,
							orderbook: "reservoir",
							orderKind: "payment-processor-v2",
							quantity: 1,
							currency: "0x0000000000000000000000000000000000000000",
							expirationTime: params.expirationTime,
							automatedRoyalties: false,
							options: {
								"payment-processor-v2": { useOffChainCancellation: true },
							},
						},
					],
				},
				{ headers }
			)
		);

		// Assume response contains signature requirements
		const signData = listResponse.data.steps.find(
			(step) => step.id === "order-signature"
		).items[0].data.sign;
		//console.log('Signing data:');
		//console.log('Sign data:', signData);
		// Step 2: Sign the listing data using EIP712
		const signature = await wallet.signTypedData(
			signData.domain,
			signData.types,
			signData.value
		);

		const { seller, ...restOfSignData } = signData.value; // Extract `seller` and gather the rest into `restOfSignData`

		const order = {
			items: [
				{
					order: {
						kind: "payment-processor-v2",
						data: {
							kind: "sale-approval",
							sellerOrBuyer: seller, // Use the extracted `seller` value as `sellerOrBuyer`
							...restOfSignData, // Spread the remaining properties
							r: "0x0000000000000000000000000000000000000000000000000000000000000000",
							s: "0x0000000000000000000000000000000000000000000000000000000000000000",
							v: 0,
						},
					},
					orderbook: "reservoir",
				},
			],
			source: "magiceden.io",
		};

		// Step 3: Submit the signed listing
		const finalListingResponse = await limiter.schedule(() =>
			axios.post(
				`${signEndpoint}?signature=${encodeURIComponent(signature)}`,
				order,
				{ headers }
			)
		);
		console.log("NFT listed successfully:");
		console.log(finalListingResponse.data);
		return finalListingResponse.data;
	} catch (error) {
		console.error("Failed to list NFT:", error.response.data);
		return null;
	}
}

// Function to cancel an order on MagicEden
async function cancelOrder(orderIds) {
	const cancelEndpoint =
		"https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/cancel/v3";
	const signEndpoint =
		"https://nfttools.pro/magiceden/v3/rtp/ethereum/execute/cancel-signature/v1";
	let headers = {
		"X-NFT-API-Key": X_NFT_API_KEY,
	};

	try {
		// Step 1: Send the initial cancel request to receive signing data
		let response = await limiter.schedule(() =>
			axios.post(cancelEndpoint, { orderIds }, { headers })
		);
		const signData = response.data.steps[0].items[0].data.sign;

		// Step 2: Sign the cancellation data
		const signature = await wallet.signTypedData(
			signData.domain,
			signData.types,
			signData.value
		);

		// Step 3: Send the signed cancellation to complete the process
		const signatureParam = `?signature=${encodeURIComponent(signature)}`;
		response = await limiter.schedule(() =>
			axios.post(
				signEndpoint + signatureParam,
				{
					orderIds,
					orderKind: "payment-processor-v2",
				},
				{ headers }
			)
		);

		console.log("Order cancelled successfully");
		return response.data;
	} catch (error) {
		console.error("Failed to cancel orders:", error.response.data);
		return null;
	}
}

// Function to fetch the lowest diamond listed item
async function fetchLowestDiamondListing(collectionContract) {
	const apiUrl = `https://nfttools.pro/magiceden/v3/rtp/ethereum/tokens/v7?includeQuantity=true&includeLastSale=true&excludeSpam=true&collection=${collectionContract}&sortBy=floorAskPrice&sortDirection=asc&limit=50&includeAttributes=false&source=magiceden.io&normalizeRoyalties=false`;
	let headers = {
		"X-NFT-API-Key": X_NFT_API_KEY,
	};
	try {
		const response = await limiter.schedule(() =>
			axios.get(apiUrl, { headers })
		);
		const tokens = response.data.tokens;

		if (tokens.length === 0) {
			console.log("No diamond listings found.");
			return null;
		}
		// Extract the lowest diamond listed item
		const lowestDiamondListing = tokens[0];
		const floorPrice = lowestDiamondListing.market.floorAsk.price.amount.native;

		//console.log(`Lowest diamond listing price: ${floorPrice} ETH`);
		return {
			tokenId: lowestDiamondListing.token.tokenId,
			floorPrice: floorPrice,
			listingDetails: lowestDiamondListing,
			maker: lowestDiamondListing.market.floorAsk.maker,
		};
	} catch (error) {
		console.error("Failed to fetch diamond listings:", error);
		return null;
	}
}

// Function to fetch the lowest listed item
async function fetchLowestListing(collectionContract) {
	const apiUrl = `https://nfttools.pro/magiceden/v3/rtp/ethereum/tokens/v7?includeQuantity=true&includeLastSale=true&excludeSpam=true&collection=${collectionContract}&sortBy=floorAskPrice&sortDirection=asc&limit=50&includeAttributes=false&normalizeRoyalties=false`;
	let headers = {
		"X-NFT-API-Key": X_NFT_API_KEY,
	};
	try {
		const response = await limiter.schedule(() =>
			axios.get(apiUrl, { headers })
		);
		const tokens = response.data.tokens;

		if (tokens.length === 0) {
			console.log("No listings found.");
			return null;
		}
		// Extract the lowest listed item
		const lowestListing = tokens[0];
		const floorPrice = lowestListing.market.floorAsk.price.amount.native;

		//console.log(`Lowest listing price: ${floorPrice} ETH`);
		return {
			tokenId: lowestListing.token.tokenId,
			floorPrice: floorPrice,
			listingDetails: lowestListing,
		};
	} catch (error) {
		console.error("Failed to fetch listings:", error);
		return null;
	}
}

async function fetchCollectionsSetId(collections) {
	const endpoint =
		"https://nfttools.pro/magiceden/v3/rtp/ethereum/collections-sets/v1";
	let headers = {
		"X-NFT-API-Key": X_NFT_API_KEY,
	};

	try {
		// Prepare the payload for the POST request
		const payload = { collections };

		// Make the POST request to fetch the collectionsSetId
		const response = await limiter.schedule(() =>
			axios.post(endpoint, payload, { headers })
		);

		// Check if the collectionsSetId is received
		if (response.data && response.data.collectionsSetId) {
			//console.log('Fetched collectionsSetId:', response.data.collectionsSetId);
			return response.data.collectionsSetId;
		} else {
			throw new Error("No collectionsSetId found in the response.");
		}
	} catch (error) {
		console.error("Error fetching collectionsSetId:", error);
		return null; // Return null or handle the error as appropriate
	}
}

async function fetchActiveOrders(maker, contractAddress, tokenId) {
	const baseUrl =
		"https://nfttools.pro/magiceden/v3/rtp/ethereum/orders/asks/v5";
	let headers = {
		"X-NFT-API-Key": X_NFT_API_KEY,
	};

	try {
		const collectionsSetId = await fetchCollectionsSetId([contractAddress]);
		if (!collectionsSetId) {
			console.log("Failed to fetch collectionsSetId.");
			return [];
		}

		const url = `${baseUrl}?status=active&maker=${maker}&collectionsSetId=${collectionsSetId}`;

		const response = await limiter.schedule(() => axios.get(url, { headers }));
		let orders = response.data.orders;

		if (!orders || orders.length === 0) {
			console.log("No active orders found.");
			return [];
		}

		// Filter orders by matching tokenId
		orders = orders.filter(
			(order) => order.criteria.data.token.tokenId === tokenId
		);

		if (orders.length === 0) {
			console.log("No active orders found for the specified tokenId.");
			return [];
		}

		// Extract the order IDs
		orders.sort((a, b) => {
			return a.price.amount.native - b.price.amount.native;
		});
		const orderIds = orders.map((order) => order.id);

		//console.log('Active Order IDs:', orderIds);
		return orderIds;
	} catch (error) {
		console.error("Error fetching active orders:", error);
		return [];
	}
}

function convertEthToWei(ethAmount) {
	if (isNaN(parseFloat(ethAmount))) {
		throw new Error(
			"Invalid input: ethAmount must be a number or a numeric string."
		);
	}

	const ethString = ethAmount.toString();
	if (!ethString.match(/^\d+(\.\d+)?$/)) {
		throw new Error(
			"Invalid input format: ethAmount must be a decimal or integer number."
		);
	}

	const [integerPart, decimalPart = ""] = ethString.split(".");
	const paddedDecimalPart = decimalPart.padEnd(18, "0");
	const weiString = integerPart + paddedDecimalPart.slice(0, 18); // Ensure only up to 18 decimal places

	return BigInt(weiString).toString();
}

async function retrieveCollectionFees(collectionSlugs) {
	const baseUrl = "https://nfttools.pro/opensea/api/v2/collections/";
	const headers = {
		"X-NFT-API-Key": X_NFT_API_KEY,
	};
	let feesMap = {};

	await Promise.all(
		collectionSlugs.map(async (slug) => {
			try {
				const response = await limiter.schedule(() =>
					axios.get(`${baseUrl}${slug}`, { headers })
				);
				const fees = response.data.fees || [];

				// Filter out fees to the specific recipient and sum the remaining fees
				const unwantedRecipient = "0x0000a26b00c1f0df003000390027140000faa719";
				const totalFees = fees
					.filter(
						(fee) =>
							fee.recipient.toLowerCase() !== unwantedRecipient.toLowerCase()
					)
					.reduce((sum, fee) => sum + parseFloat(fee.fee), 0);

				feesMap[slug] = totalFees; // Store the sum of applicable fees for each slug
			} catch (error) {
				console.error(`Failed to retrieve fees for collection: ${slug}`, error);
				feesMap[slug] = "Error retrieving fees";
			}
		})
	);

	return feesMap;
}

let initialFilteredNFTsCount = {}; // Object to store initial filtered NFTs count

async function formatInitialStats() {
	const collectionSlugs = ["mutant-ape-yacht-club", "lasogette", "lilpudgys"]; // Add your collection slugs here
	const userNFTs = await fetchUserNFTs(WALLET_ADDRESS);
	let stats = "ME Diamond Listing Bot Started - Current NFT Holdings:\n";

	collectionSlugs.forEach((slug) => {
		const filteredNFTs = filterNFTsByContract(userNFTs, slug);
		initialFilteredNFTsCount[slug] = filteredNFTs.length;
		stats += `Collection: ${slug}, Count: ${filteredNFTs.length}\n`;
	});

	return stats;
}

async function monitorNFTs() {
	const collectionSlugs = ["mutant-ape-yacht-club", "lasogette", "lilpudgys"]; // Add your collection slugs here

	const userNFTs = await fetchUserNFTs(WALLET_ADDRESS);

	// Record initial counts
	collectionSlugs.forEach((slug) => {
		const filteredNFTs = filterNFTsByContract(userNFTs, slug);
		initialFilteredNFTsCount[slug] = filteredNFTs.length;
	});

	console.log("Initial filtered NFTs count:", initialFilteredNFTsCount);

	// Send initial stats to Discord
	const initialStatsMessage = await formatInitialStats();
	await sendDiscordAlert(initialStatsMessage);

	// Monitor every 5 minutes
	setInterval(async () => {
		try {
			const userNFTs = await fetchUserNFTs(WALLET_ADDRESS);

			collectionSlugs.forEach((slug) => {
				const filteredNFTs = filterNFTsByContract(userNFTs, slug);
				const currentCount = filteredNFTs.length;
				const initialCount = initialFilteredNFTsCount[slug];

				if (currentCount !== initialCount) {
					const message = `NFT count changed for collection ${slug}: Initial count was ${initialCount}, current count is ${currentCount}`;
					console.log(message);
					sendDiscordAlert(message);

					// Update initial count to current count after sending alert
					initialFilteredNFTsCount[slug] = currentCount;
				}
			});
		} catch (error) {
			console.error("Error during monitoring:", error);
		}
	}, 5 * 60 * 1000); // 5 minutes in milliseconds
}

async function main() {
	const minProfit = 0.005; // 0.01 ETH minimum profit

	const buyGasFee = 0.005; // 0.01 ETH buy gas fee
	const margin = 0.000001; // 0.0001 ETH margin

	const collectionSlugs = ["mutant-ape-yacht-club", "lasogette", "lilpudgys"]; // Contract address for the collection
	const fees = await retrieveCollectionFees(collectionSlugs);
	console.log("Fees:", fees);

	monitorNFTs(); // Start monitoring NFT counts

	while (true) {
		try {
			const userNFTs = await fetchUserNFTs(WALLET_ADDRESS);

			for (let collectionSlug of collectionSlugs) {
				const filteredNFTs = filterNFTsByContract(userNFTs, collectionSlug);

				//console.log(`Found ${filteredNFTs.length} NFTs in the specified collection.`);

				for (let nft of filteredNFTs) {
					console.log(
						"-------------------------------------------------------"
					);
					console.log(
						`Processing Slug: ${nft.token.collection.name} Token ID: ${nft.token.tokenId}`
					);
					console.log(
						"-------------------------------------------------------"
					);
					const collectionContract = nft.token.contract;
					const tokenID = nft.token.tokenId;
					const royalty = fees[collectionSlug] / 100 + 0.005; // 1% royalty
					console.log(`Royalty: ${royalty}`);
					let listedPrice =
						nft.ownership?.floorAsk?.price?.amount?.native ?? null;
					let listedNetAmount =
						(listedPrice * (1 - royalty)).toFixed(4) ?? null;
					let listingOrder = nft.ownership?.floorAsk?.id ?? null;

					const orders = await fetchActiveOrders(
						WALLET_ADDRESS,
						collectionContract,
						tokenID
					);
					//console.log('Active orders:', orders);
					if (orders.length != 0 && orders.length != listingCount) {
						console.log("Multiple active orders found: " + orders.length);
						console.log(orders);
						console.log("Cancelling active orders...");
						// Skip the first order and cancel the rest
						//const ordersToCancel = orders.slice(0, -1); // This creates a new array from the second element to the end
						try {
							// Create an array of promises for cancelling orders
							const cancelPromises = orders.map((order) =>
								cancelOrder([order])
							);

							// Wait for all cancel promises to complete
							await Promise.all(cancelPromises);

							console.log("All orders cancelled successfully");
						} catch (error) {
							console.error("Failed to cancel orders:", error);
						}
						listingOrder = null;
						listedPrice = null;
						listedNetAmount = null;
					}
					//await pressEnterToContinue();

					console.log(`Listed price: ${listedPrice} ETH`);
					console.log(`Listed net amount: ${listedNetAmount} ETH`);

					const lowestListing = await fetchLowestListing(collectionContract);
					const lowestDiamondListing = await fetchLowestDiamondListing(
						collectionContract
					);
					//console.log(lowestListing.listingDetails.market);
					if (lowestListing && lowestDiamondListing) {
						console.log(
							`Lowest listing price: ${lowestListing.floorPrice} ETH`
						);
						console.log(
							`Lowest diamond listing price: ${lowestDiamondListing.floorPrice} ETH`
						);

						// const sellPrice = Math.max(
						//    lowestDiamondListing.floorPrice - margin,
						//    ((lowestListing.floorPrice + buyGasFee + minProfit*1.01))/ (1 - royalty));

						const sellPrice =
							(lowestListing.floorPrice + buyGasFee + minProfit * 1.01) /
							(1 - royalty);

						const netSellPrice = sellPrice * (1 - royalty);
						console.log(`Selling price: ${sellPrice.toFixed(4)} ETH`);
						const netProfit =
							netSellPrice - lowestListing.floorPrice - buyGasFee;

						console.log(
							`Token ID: ${
								nft.token.tokenId
							}, Potential net profit: ${netProfit.toFixed(4)} ETH`
						);

						if (
							listedPrice &&
							(netProfit < minProfit || listedPrice != sellPrice.toFixed(5))
						) {
							console.log(
								"Net profit is less than the minimum profit or the lowest diamond listing is not owned by the wallet address."
							);
							console.log("Cancelling listing...");
							await cancelOrder([listingOrder]);
							listingOrder = null;
							listedPrice = null;
							listedNetAmount = null;
						}

						if (!listedPrice && netProfit > minProfit) {
							console.log("Listing NFT for price:", sellPrice);
							try {
								// Create an array of promises for listing NFTs
								const listPromises = [];
								for (let i = 0; i < listingCount; i++) {
									const listPromise = listNFT({
										maker: WALLET_ADDRESS,
										tokenAddress: collectionContract,
										tokenId: nft.token.tokenId,
										weiPrice: convertEthToWei(sellPrice + i * 0.000001),
										expirationTime: JSON.stringify(
											Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7
										), // 7 days
									});
									listPromises.push(listPromise);
								}

								// Wait for all listing promises to complete
								await Promise.all(listPromises);

								console.log("All NFTs listed successfully");
							} catch (error) {
								console.error("Failed to list NFTs:", error);
							}
						}
					}
					console.log("");
				}
			}
		} catch (error) {
			console.error("Failed to fetch data:", error);
		}
	}
}

main();
