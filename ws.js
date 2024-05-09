import {
	AssetPageQuery,
	x_signed_AssetPageQuery,
	OrdersQuery,
	x_signed_OrdersQuery,
	CreateOfferActionModalQuery,
	x_signed_CreateOfferActionModalQuery,
	useHandleBlockchainActionsCreateOrderMutation,
	x_signed_useHandleBlockchainActionsCreateOrderMutation,
	CollectionAssetSearchListPaginationQuery,
	x_signed_CollectionAssetSearchListPaginationQuery,
	NavSearchCollectionsQuery,
	x_signed_NavSearchCollectionsQuery,
	CollectionAssetSearchListQuery,
	x_signed_CollectionAssetSearchListQuery,
	useGaslessCancelOrdersMutation,
	x_signed_useGaslessCancelOrdersMutation,
	AccountOffersOrderSearchListQuery,
	x_signed_AccountOffersOrderSearchListQuery,
	challengeLoginMessageQuery,
	x_signed_challengeLoginMessageQuery,
	authLoginV2AuthSimplifiedMutation,
	x_signed_authLoginV2AuthSimplifiedMutation,
} from "./graphql.js";
import { RateLimit } from "async-sema";
import PQueue from "p-queue";
import { promises as fs, stat } from "fs";
import { createReadStream } from "fs";
import { v4 as uuidv4 } from "uuid";
import { ethers, formatUnits } from "ethers";
import { parse } from "csv-parse";
import dotenv from "dotenv";
import express, { raw } from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import pkg from "js-sha3";
const { keccak256 } = pkg;
import axios from "axios";
import axiosRetry from "axios-retry";

//SEAPORT 1.6
const zone = "0x000056f7000000ece9003ca63978907a00ffd100";
const conduitKey =
	"0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000";
const protocol_address = "0x0000000000000068f116a894984e2db1123eb395";

// Custom error object
const unauthorizedError = {
	code: 401,
	message: "No authenticated wallet found",
};

let loginToOpenSeaInProgress = false;
let openSeaLoginSuccess = false;

import NodeCache from "node-cache";
const floorPriceCache = new NodeCache({ stdTTL: 300, checkperiod: 320 });

// Response interceptor
axios.interceptors.response.use(
	async (response) => {
		// If the response is successful (status code 200)
		if (response.status === 200) {
			// Check if the response contains the specific error message
			if (
				response.data &&
				response.data.errors &&
				response.data.errors.some(
					(err) => err.message === "[401] No authenticated wallet found"
				)
			) {
				// If the error message is found, call loginToOpensea and retry the request
				try {
					if (!loginToOpenSeaInProgress) openSeaLoginSuccess = false;

					if (Console_Only_Errors === "false")
						console.log("[401] No authenticated wallet found");

					await loginToOpenSea();

					// Update the request headers with the new cookies
					const newConfig = {
						...response.config,
						headers: {
							...response.config.headers,
							cookie: base_headers.cookie,
						},
					};

					// Retry the original request with the updated headers
					return axios(newConfig);
				} catch (error) {
					// Handle login error
					console.log("Error: " + error);
					return Promise.reject(error);
				}
			}
		}
		// If the response is successful and doesn't contain the error message, return the response
		return response;
	},
	(error) => {
		// Handle other errors
		return Promise.reject(error);
	}
);

// Configure axios-retry
axiosRetry(axios, {
	retries: 3, // Number of retry attempts
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
		//console.log('  Headers:', error.response ? error.response.headers : 'N/A');
		//console.log('  Config:', error.config);
		if (error === unauthorizedError) {
			await loginToOpensea();
		}
		await API_RateLimit();
		return axiosRetry.exponentialDelay(retryCount);
	},
	retryCondition: (error) => {
		return (
			axiosRetry.isNetworkOrIdempotentRequestError(error) ||
			(error.response && error.response.status === 429) ||
			(error.response && error.response.status === 408) ||
			(error.response && error.response.status === 503) ||
			error === unauthorizedError
		);
	},
});

dotenv.config();

// Load environment variables
const walletAddress = process.env.WALLET_ADDRESS.toLowerCase();
const walletPrivateKey = process.env.WALLET_PRIVATE_KEY.toLowerCase();
const infuraKeyEnv = process.env.infuraKeyEnv;
const offer_on_own_asset = process.env.OFFER_ON_OWN_ASSET.toLowerCase();
const outbid_on_own_offer = process.env.OUTBID_ON_OWN_OFFER.toLowerCase();
const offer_max_when_outbid = process.env.OFFER_MAX_WHEN_OUTBID.toLowerCase();
const parallel_processing = process.env.PARALLEL_PROCESSING.toLowerCase();
const trial_mode = process.env.TRIAL_MODE.toLowerCase();
const apiKey = process.env.OPENSEA_API_KEY;
const bidIncrement = process.env.BID_INCREMENT;
const rateLimit = parseFloat(process.env.RATE_LIMIT);
const cancelAllOffersOnStart =
	process.env.CANCEL_ALL_OFFERS_ON_START.toLowerCase();
const PORT = process.env.EXPRESS_PORT; // Port number for the web server
const Console_Only_Errors = "false";
// Convert the URL to a file path
const __filename = fileURLToPath(import.meta.url);

// Get the directory name from the file path
const __dirname = path.dirname(__filename);

const app = express();

// Setup nfttools.pro rate limit
const API_RateLimit = RateLimit(rateLimit * 0.95, {
	uniformDistribution: true,
});

// Serve static files from the 'public' directory (e.g., html, css, js for your website)
app.use(express.static("public"));

app.get("/", (req, res) => {
	res.sendFile(__dirname + "/bidding_history.html");
});

app.get("/api/bidding-history", (req, res) => {
	// Assuming 'biddingHistory' is an array of objects each containing at least a 'timestamp' field

	// Sort the array by timestamp in descending order first to ensure the newest are at the top
	const sortedBiddingHistory = biddingHistory.sort(
		(a, b) => new Date(b.timestamp) - new Date(a.timestamp)
	);

	// Then, map to transform each bid object to remove 'timestamp' and add 'timeAgo'
	const historyWithTimeAgo = sortedBiddingHistory.map((bid) => {
		const { timestamp, ...restOfBid } = bid; // Use destructuring to exclude the 'timestamp' field

		return {
			...restOfBid,
			timeAgo: formatTimeAgo(new Date(timestamp)), // Assuming formatTimeAgo is a function that returns a time ago string
		};
	});

	// Send the transformed and sorted history as JSON
	res.json(historyWithTimeAgo);
});

app.get("/api/bid-rates", (req, res) => {
	const scheduledRate = estimatorScheduled.calculateBidsPerMinute();
	const counterRate = estimatorCounter.calculateBidsPerMinute();
	const bidsToCancel = offersToCancel.length;

	res.json({
		scheduled: scheduledRate,
		counter: counterRate,
		amount: bidsToCancel,
	});
});

// Start the web server
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});

let biddingHistory = [];

class BiddingSpeedEstimator {
	constructor() {
		this.bidsTimestamps = [];
		this.startTime = null; // Initially, the start time is not set
	}

	// Method to explicitly start the timer
	startTimer() {
		if (this.startTime === null) {
			// Ensure the timer is only started once
			this.startTime = Date.now();
		}
	}

	// Call this method whenever a bid is received
	recordBid() {
		if (this.startTime === null) {
			// Optionally, you can still auto-start if not manually started
			// this.startTimer();
			console.warn("Timer has not been started. Call startTimer() to begin.");
			return; // Early return if the timer hasn't started
		}

		const now = Date.now();
		this.bidsTimestamps.push(now);
		this.cleanOldBids(now);
	}

	// Remove bids outside the 1-minute window
	cleanOldBids(currentTime) {
		const oneMinuteAgo = currentTime - 60000;
		this.bidsTimestamps = this.bidsTimestamps.filter(
			(timestamp) => timestamp > oneMinuteAgo
		);
	}

	// Calculate the bidding speed per minute
	calculateBidsPerMinute() {
		if (this.startTime === null) {
			return 0; // If the timer hasn't started, return 0
		}

		const now = Date.now();
		const elapsedTime = (now - this.startTime) / 60000; // Convert milliseconds to minutes

		if (elapsedTime < 1) {
			// For the first minute, scale the number of bids to a full minute
			const bidsCount = this.bidsTimestamps.length;
			return Math.round(bidsCount / elapsedTime); // Correct scaling to a full minute
		} else {
			// After the first minute, just count the bids in the last minute
			this.cleanOldBids(now);
			return this.bidsTimestamps.length; // Bids in the last minute
		}
	}
}

// Example usage
const estimatorScheduled = new BiddingSpeedEstimator();
const estimatorCounter = new BiddingSpeedEstimator();

function formatTimeAgo(date) {
	const now = new Date();
	const secondsAgo = Math.round((now - date) / 1000);

	if (secondsAgo < 60) {
		return `${secondsAgo} seconds ago`;
	} else if (secondsAgo < 3600) {
		// Less than 1 hour
		return `${Math.floor(secondsAgo / 60)} minutes ago`;
	} else if (secondsAgo < 86400) {
		// Less than 1 day
		return `${Math.floor(secondsAgo / 3600)} hours ago`;
	} else if (secondsAgo < 2592000) {
		// Less than 30 days
		return `${Math.floor(secondsAgo / 86400)} days ago`;
	} else if (secondsAgo < 31536000) {
		// Less than 1 year
		return `${Math.floor(secondsAgo / 2592000)} months ago`;
	} else {
		return `${Math.floor(secondsAgo / 31536000)} years ago`;
	}
}

import WebSocket from "ws";
import { da } from "date-fns/locale";
import { log } from "console";
import { get } from "http";

// WebSocket reconnection settings
const MAX_RETRIES = 10; // Maximum number of retries
let retryCount = 0; // Current retry attempt
let ws; // WebSocket instance
let reconnectTimeoutId = null; // Keep track of the reconnection timeout ID
let heartbeatIntervalId = null; // Keep track of the heartbeat interval ID
let bidData = [];
let uniqueBidDataMap = new Map();
let csvProcessed = false;

let uniqueSlugs = []; // Store the unique slugs globally

function connectWebSocket() {
	const baseEndpoint = "wss://stream.openseabeta.com/socket/websocket";

	ws = new WebSocket(`${baseEndpoint}?token=${apiKey}`);

	ws.on("open", function open() {
		console.log("Connected to OpenSea Stream API");

		retryCount = 0;
		// Clear any pending reconnection attempt
		if (reconnectTimeoutId !== null) {
			clearTimeout(reconnectTimeoutId);
			reconnectTimeoutId = null;
		}
		// Clear existing heartbeat interval and set a new one
		if (heartbeatIntervalId !== null) {
			clearInterval(heartbeatIntervalId);
		}
		heartbeatIntervalId = setInterval(() => {
			//console.log('Sending heartbeat to OpenSea Stream API');
			ws.send(
				JSON.stringify({
					topic: "phoenix",
					event: "heartbeat",
					payload: {},
					ref: 0,
				})
			);
		}, 10000);

		// Subscribe to collections when the WebSocket is connected or reconnected
		if (uniqueSlugs.length > 0) {
			subscribeToCollections(uniqueSlugs);
		}
	});

	ws.on("message", function incoming(data) {
		const message = JSON.parse(data);
		//if (message.event === 'phx_reply' && message.topic === 'phoenix')
		//console.log('Received message from OpenSea Stream API:', message);
		// Handle incoming messages here
		handleIncomingBid(message);
	});

	ws.on("close", function close() {
		console.log("Disconnected from OpenSea Stream API");
		// Clear the heartbeat interval when the connection is closed
		if (heartbeatIntervalId !== null) {
			clearInterval(heartbeatIntervalId);
			heartbeatIntervalId = null;
		}
		attemptReconnect();
	});

	ws.on("error", function error(err) {
		console.error("WebSocket error:", err);
		ws.close(); // Ensure the WebSocket is closed before attempting to reconnect
	});
}

function waitForCSVProcessed(callback) {
	if (csvProcessed) {
		uniqueSlugs = Array.from(new Set(bidData.map((bid) => bid.slug))); // Extract unique slugs from bidData
		callback();
	} else {
		setTimeout(() => {
			waitForCSVProcessed(callback);
		}, 1000); // Check every 1 second
	}
}

// Connect to the WebSocket
connectWebSocket();

// Wait for CSV processing to complete and subscribe to collections
waitForCSVProcessed(() => {
	if (ws.readyState === WebSocket.OPEN) {
		subscribeToCollections(uniqueSlugs);
	}
});

// Attempt to reconnect with exponential backoff
function attemptReconnect() {
	if (retryCount < MAX_RETRIES) {
		// Ensure only one reconnect attempt is scheduled
		if (reconnectTimeoutId !== null) {
			clearTimeout(reconnectTimeoutId);
		}
		let delay = Math.pow(2, retryCount) * 1000;
		console.log(`Attempting to reconnect in ${delay / 1000} seconds...`);
		reconnectTimeoutId = setTimeout(connectWebSocket, delay);
		retryCount++;
	} else {
		console.log("Max retries reached. Giving up on reconnecting.");
	}
}

const serverURL = "https://nfttools.pro/opensea/__api/graphql/";
const x_nft_api_key = process.env.x_nft_api_key;

let base_headers = {
	"x-nft-api-key": x_nft_api_key,
};

// Create a provider instance
const provider = new ethers.InfuraProvider("mainnet", infuraKeyEnv);

// Create a wallet instance using the private key
const wallet = new ethers.Wallet(walletPrivateKey, provider);

// Save uniqueBidDataMap on exit
process.on("exit", async () => {
	console.log("Bot is exiting. Saving uniqueBidDataMap...");
	if (csvProcessed) {
		await saveProcessedData(bidData, uniqueBidDataMap);
		console.log("uniqueBidDataMap saved successfully.");
	}
});

// Save uniqueBidDataMap on SIGINT (Ctrl+C)
process.on("SIGINT", async () => {
	console.log("Bot is being terminated. Saving uniqueBidDataMap...");
	if (csvProcessed) {
		await saveProcessedData(bidData, uniqueBidDataMap);
		console.log("uniqueBidDataMap saved successfully.");
	}
	process.exit(0);
});

const main = async () => {
	try {
		if (!walletAddress || !walletPrivateKey || !infuraKeyEnv) {
			throw new Error("Missing .env variables!");
		}

		await loginToOpenSea();
		//Schedule login to OpenSea every 2 minutes to keep the session alive
		setInterval(async () => {
			await loginToOpenSea();
		}, 2 * 60000); // 2 minutes

		//Process data from CSV file
		({ processedData: bidData, uniqueTokenIdMap: uniqueBidDataMap } =
			await processCSVData("file.csv"));

		setInterval(() => {
			saveProcessedData(bidData, uniqueBidDataMap);
		}, 60000); // Save every 60 seconds

		if (cancelAllOffersOnStart === "true") await cancelAllOffers();

		csvProcessed = true;

		// Process offers in parallel or sequentially based on configuration
		estimatorScheduled.startTimer(); // Explicitly start the timer
		estimatorCounter.startTimer(); // Explicitly start the timer

		if (parallel_processing === "true") {
			await continuouslyProcessOffersInParallel(bidData);
		} else {
			await continuouslyProcessOffersSequentially(bidData);
		}
	} catch (error) {
		console.error("Error in main function:", error);
	}
};

main();

function subscribeToCollections(collectionSlugs) {
	// Subscribe to each unique slug
	collectionSlugs.forEach((slug) => {
		ws.send(
			JSON.stringify({
				topic: `collection:${slug}`,
				event: "phx_join",
				payload: {},
				ref: 0,
			})
		);
		console.log(`Subscribed to collection: ${slug}`);
	});
}

async function retrieveCollectionFees(collectionSlugs) {
	const queue = new PQueue({ concurrency: 5 }); // Define concurrency limit
	const baseUrl = "https://nfttools.pro/opensea/api/v2/collections/";
	const headers = { ...base_headers };
	let feesMap = {};

	const tasks = collectionSlugs.map((slug) => {
		return async () => {
			try {
				await API_RateLimit(); // Handle rate limiting
				const response = await axios.get(`${baseUrl}${slug}`, {
					headers: headers,
				});
				const fees = response.data.fees || [];
				feesMap[slug] = fees.map((fee) => ({
					fee: fee.fee,
					recipient: fee.recipient,
					required: fee.required,
				}));
			} catch (error) {
				console.error(`Failed to retrieve fees for collection: ${slug}`, error);
				feesMap[slug] = "Error retrieving fees";
			}
		};
	});

	// Add tasks to the queue
	tasks.forEach((task) => queue.add(task));

	// Wait for all tasks to complete
	await queue.onIdle();
	return feesMap;
}

const processingItems = new Set();

async function handleIncomingBid(message) {
	let incomingContractAddress;
	let incomingBidAmount;
	let incomingItemKey;
	let incomingSlug;
	if (
		message.event === "item_received_bid" ||
		message.event === "collection_offer" ||
		message.event === "trait_offer"
	) {
		if (message.event === "item_received_bid") {
			// Extract the tokenID only for item_received_bid event
			const nftIdParts = message.payload.payload.item.nft_id.split("/");
			incomingContractAddress = nftIdParts[nftIdParts.length - 2];
			incomingSlug = message.payload.payload.collection.slug;
			const incomingTokenID = nftIdParts[nftIdParts.length - 1];
			incomingItemKey = `${incomingContractAddress}:${incomingSlug}:${incomingTokenID}:null`;
			incomingBidAmount = parseFloat(
				formatUnits(message.payload.payload.base_price, "ether")
			);
			//console.log(incomingItemKey);
		}
		if (message.event === "collection_offer") {
			incomingContractAddress =
				message.payload.payload.asset_contract_criteria.address;
			incomingSlug = message.payload.payload.collection.slug;
			incomingItemKey = `${incomingContractAddress}:${incomingSlug}:undefined:{}`;
			incomingBidAmount = parseFloat(
				formatUnits(message.payload.payload.base_price, "ether")
			);
			//console.log(incomingItemKey);
		}
		if (message.event === "trait_offer") {
			incomingContractAddress =
				message.payload.payload.asset_contract_criteria.address;
			incomingSlug = message.payload.payload.collection.slug;
			//console.log(JSON.stringify(message.payload));
			const trait = {
				type: message.payload.payload.trait_criteria.trait_type,
				value: message.payload.payload.trait_criteria.trait_name,
			};
			incomingItemKey = `${incomingContractAddress}:${incomingSlug}:undefined:${JSON.stringify(
				trait
			)}`;
			// console.log(incomingItemKey);
			// console.log(uniqueBidDataMap)
			incomingBidAmount = parseFloat(
				formatUnits(message.payload.payload.base_price, "ether")
			);
		}

		incomingBidAmount = parseFloat(
			formatUnits(message.payload.payload.base_price, "ether")
		);
		// Check if the item is already being processed
		while (processingItems.has(incomingItemKey)) {
			//console.log(`Waiting for bid ${incomingCollection}#${incomingTokenID}`);
			await delay(1000); // Wait for 1 second before retrying
		}

		// Convert base_price from Wei to ETH using formatUnits

		const incomingBidMaker =
			message.payload.payload.maker.address.toLowerCase();

		if (incomingBidMaker.toLowerCase() != walletAddress.toLowerCase()) {
			if (uniqueBidDataMap.has(incomingItemKey)) {
				const item = uniqueBidDataMap.get(incomingItemKey);
				const { minBid, maxBid, lastBidOrder } = item;

				// Check if item.lastBidOrder exists and has an expiry property
				if (item.lastBidOrder && item.lastBidOrder.expiry) {
					// Convert the expiry time from seconds to milliseconds by parsing it as an integer
					// and then multiplying by 1000 to compare with the current time in milliseconds
					const expiryInMilliseconds =
						parseInt(item.lastBidOrder.expiry, 10) * 1000;

					// Get the current time in milliseconds
					const currentTime = new Date().getTime();

					// If the current time is greater than the expiry time, set lastBidOrder to null
					if (currentTime > expiryInMilliseconds) {
						item.lastBidOrder = null;
					}
				}

				// Ensure lastBidAmount is in ETH for comparison, using formatUnits
				const lastBidAmount = lastBidOrder
					? parseFloat(formatUnits(lastBidOrder.current_price))
					: 0;

				// Compare incomingBidAmount with lastBidAmount, both in ETH now
				if (
					incomingBidAmount >= minBid &&
					incomingBidAmount <= maxBid &&
					(!lastBidOrder || incomingBidAmount > lastBidAmount)
				) {
					//console.log(`Received bid for ${incomingCollection}#${incomingTokenID} with amount ${incomingBidAmount} ETH`);
					item.source = "Counter Offer";
					item.topOffer = incomingBidAmount;
					item.bidAmount = (
						parseFloat(incomingBidAmount) + parseFloat(bidIncrement)
					).toFixed(4);

					// Add the item to the processing set
					processingItems.add(incomingItemKey);

					try {
						//console.log(`Processing bid for ${incomingItemKey} with amount ${incomingBidAmount} ETH`);
						const { logObject, newItem } = await processItem(item);
						if (
							(Console_Only_Errors === "true" &&
								logObject.status != "Success") ||
							Console_Only_Errors === "false"
						) {
							console.log("Offer Status: " + logObject.status);
							console.log(logObject);
						}

						newItem.lastProcessed = Date.now(); // Update lastProcessed to current time after processing
						uniqueBidDataMap.set(incomingItemKey, newItem);
					} finally {
						// Remove the item from the processing set after processing is complete
						processingItems.delete(incomingItemKey);
					}
				}
			}
		} else {
			// Ignoring own bid
		}
	}
}

// Function to read data from a CSV file and return as an array of arrays
async function readCSVFile(filename) {
	console.log("Reading CSV file:", filename);
	return new Promise((resolve, reject) => {
		const data = [];
		createReadStream(filename)
			.pipe(
				parse({
					delimiter: ",",
					trim: true,
					skip_empty_lines: true,
					relax_column_count: true, // This allows for a varying number of columns
					from_line: 2, // Adjust if your CSV includes a header row
				})
			)
			.on("data", (row) => {
				let obj = {};
				if (row.length >= 8) {
					// Ensure at least 8 fields are present, adjust according to your needs
					obj = {
						chain: row[0], // Chain is now the first column
						contractAddress: row[1],
						slug: row[2],
						tokenIds: row[3]
							? row[3]
									.split(",")
									.map((id) => id.trim())
									.filter(Boolean)
							: null,
						minBid: parseFloat(row[4]),
						maxBid: parseFloat(row[5]),
						duration: row[6],
						loop: row[7],
						traits: row[8] ? row[8] : null,
						searchs: row[9] ? row[9] : null,
						criteria: row[10] ? JSON.parse(row[10]) : null, // Add trait field
						minFloor: parseFloat(row[11]),
						maxFloor: parseFloat(row[12]),
					};
				}
				//console.log(obj.searchs)
				data.push(obj);
			})
			.on("end", () => resolve(data))
			.on("error", (error) => reject(error));
	});
}

// Helper function to get file stats (like modification time)
// Using async/await with fs.promises for getFileStats
async function getFileStats(filename) {
	try {
		const stats = await fs.stat(filename);
		return stats;
	} catch (error) {
		if (error.code === "ENOENT") {
			console.error(`File does not exist: ${filename}`);
			return null; // Handle non-existing file as needed
		} else {
			throw error;
		}
	}
}

// Function to save file csv as json data
async function saveFileData(data) {
	const filePath = path.join(__dirname, "file.json");
	try {
		await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
	} catch (error) {
		console.error("Error saving file data:", error);
		throw error;
	}
}

// Function to save processed data, file metadata, and uniqueTokenIdMap
async function saveProcessedData(data, uniqueTokenIdMap) {
	const filePath = path.join(__dirname, "processedData.json");

	const content = {
		data: data,
		uniqueTokenIdMap: Array.from(uniqueTokenIdMap.entries()), // Convert Map to an array of key-value pairs
	};

	try {
		await fs.writeFile(filePath, JSON.stringify(content, null, 2), "utf8");
	} catch (error) {
		console.error("Error saving processed data:", error);
		throw error;
	}
}

// Function to load processed data and uniqueTokenIdMap if available and up-to-date
async function loadProcessedData(filename) {
	const filePath = path.join(__dirname, "processedData.json");
	try {
		const fileContent = await fs.readFile(filePath, "utf8");
		const content = JSON.parse(fileContent);

		const currentFileStats = await getFileStats(filename);
		if (
			content.fileInfo.name === filename &&
			content.fileInfo.lastModified === currentFileStats.mtime.getTime()
		) {
			console.log("Loading processed data from cache.");
			const uniqueTokenIdMap = new Map(content.uniqueTokenIdMap); // Convert the array of key-value pairs back to Map
			return { data: content.data, uniqueTokenIdMap }; // Return both data and uniqueTokenIdMap
		} else {
			console.log("CSV file has changed. Re-processing.");
			return null;
		}
	} catch (error) {
		console.log(
			"No processed data found or error reading file. Processing from scratch."
		);
		return null;
	}
}

function normalizeSlug(row, contractAddressToSlugMapping) {
	row.slug =
		row.slug ?? contractAddressToSlugMapping[row.contractAddress] ?? null;
}

function attachFees(row, feesMap) {
	row.fees =
		row.slug && feesMap[row.slug]
			? feesMap[row.slug]
			: "Fees information unavailable";
}

async function expandTokenRanges(row) {
	if (
		!row.tokenIds ||
		!row.tokenIds.length ||
		row.tokenIds[0].toLowerCase() === "all"
	)
		return;

	const allTokens = row.tokenIds.reduce((acc, token) => {
		if (token.includes("-")) {
			const [start, end] = token.split("-").map(Number);
			acc.push(...Array.from({ length: end - start + 1 }, (_, i) => start + i));
		} else {
			acc.push(Number(token));
		}
		return acc;
	}, []);

	row.tokenIds = allTokens;
}

async function handleAllTokens(row) {
	if (
		row.tokenIds &&
		row.tokenIds[0] &&
		row.tokenIds[0].toLowerCase() === "all"
	) {
		row.tokenIds = await findAllTokens(row.slug);
	}
}

function createTokenRows(row, processedData) {
	const tokenRows = (row.tokenIds || []).map((tokenId) => ({
		source: "Scheduled",
		chain: row.chain,
		...row,
		tokenId: String(tokenId),
		searchs: null,
		traits: null,
	}));

	tokenRows.forEach((tokenRow) => {
		delete tokenRow.tokenIds; // Clean up the redundant field
		processedData.push(tokenRow);
	});
}

async function processCSVData(filename) {
	const cachedData = await loadProcessedData(filename);
	if (cachedData) {
		console.log(
			"Using cached data. Total unique token IDs:",
			cachedData.uniqueTokenIdMap.size
		);
		return {
			processedData: cachedData.data,
			uniqueTokenIdMap: cachedData.uniqueTokenIdMap,
		};
	}

	const rawData = await readCSVFile(filename);
	console.log("Raw data from CSV:", rawData);
	console.log("Processing CSV data...");
	//console.log(rawData);
	await saveFileData(rawData);
	console.log("Data saved to file.json");
	// Extract unique contract addresses and their corresponding chains
	// Use a Set to collect unique combinations of contractAddress and chain
	const uniqueKeySet = new Set();
	const uniqueContractAddressesWithChains = [];

	rawData.forEach((row) => {
		const uniqueKey = `${row.contractAddress}-${row.chain}`; // Create a unique key combining both values
		if (!uniqueKeySet.has(uniqueKey)) {
			uniqueKeySet.add(uniqueKey);
			uniqueContractAddressesWithChains.push({
				contractAddress: row.contractAddress,
				chain: row.chain,
			});
		}
	});

	// Now uniqueContractAddressesWithChains contains unique pairs without duplicates
	// Fetch collection slugs using the contract addresses and chains
	console.log("Fetching collection slugs...");
	const contractAddressToSlugMapping = await fetchCollectionSlugs(
		uniqueContractAddressesWithChains
	);
	console.log(
		"Collection slugs fetched, length:",
		Object.keys(contractAddressToSlugMapping).length
	);

	// Existing unique slugs derived from contractAddressToSlugMapping
	const uniqueSlugs = Object.values(contractAddressToSlugMapping).filter(
		(slug) => slug
	);

	// Extract slugs from rawData, assuming rawData is an array of objects with a `slug` property
	const rawDataSlugs = rawData.map((row) => row.slug).filter((slug) => slug);

	// Combine uniqueSlugs and rawDataSlugs, removing duplicates
	const combinedUniqueSlugs = Array.from(
		new Set([...uniqueSlugs, ...rawDataSlugs])
	);

	// Retrieve and map collection fees
	console.log("Retrieving collection fees...");
	const feesMap = await retrieveCollectionFees(combinedUniqueSlugs); // Fetch fees based on combined unique slugs
	console.log("Fees retrieved, length:", Object.keys(feesMap).length);

	let processedCount = 0; // Counter for processed rows
	const totalRows = rawData.length; // Total number of rows to process
	console.log("Total rows to process:", totalRows);
	// Function to log progress
	const logProgress = (length) => {
		processedCount += 1; // Increment the counter each time a row is processed
		console.log(
			`Processing progress: ${processedCount}/${totalRows} rows processed (${(
				(processedCount / totalRows) *
				100
			).toFixed(2)}%) Token count: ${length}`
		);
	};

	let processedData = []; // Array to collect all new rows created during processing

	await Promise.all(
		rawData.map(async (row) => {
			// Attach slug to row data if available
			const slug = contractAddressToSlugMapping[row.contractAddress];
			row.slug = row.slug ?? slug ?? null;
			// Attach fees to row data if available
			if (row.slug && feesMap[row.slug]) {
				row.fees = feesMap[row.slug];
			} else {
				// Handle the case where fees might not have been successfully retrieved
				row.fees = "Fees information unavailable";
			}

			// PROCESS TOKENS START
			// Check if any tokenId contains a '-', exit early if none found
			if (
				row.tokenIds &&
				row.tokenIds.some((token) => token.includes("-")) &&
				row.tokenIds[0].toLowerCase() != "all"
			) {
				// Temporary array to hold all expanded tokens
				let allTokens = [];

				// Iterate over each tokenId
				row.tokenIds.forEach((token) => {
					if (token.includes("-")) {
						// Split the range into start and end, then convert to numbers
						const [start, end] = token.split("-").map(Number);
						// Create an array for this range and add to allTokens
						const rangeTokens = Array.from(
							{ length: end - start + 1 },
							(_, i) => start + i
						);
						allTokens.push(...rangeTokens);
					} else {
						// Add non-range tokens directly to allTokens
						allTokens.push(Number(token));
					}
				});

				// Replace the old tokenIds with the expanded allTokens array
				row.tokenIds = allTokens;
			}

			if (
				row.tokenIds &&
				row.tokenIds[0] &&
				typeof row.tokenIds[0] === "string" &&
				row.tokenIds[0].toLowerCase() === "all"
			) {
				row.tokenIds = await findAllTokens(row.slug);
			}

			const tokenRows = (row.tokenIds || []).map((tokenId) => {
				// Create a new row object for each token ID
				let newTokenRow = {
					source: "Scheduled", // Mark the source of this data as 'Scheduled'
					...row, // Spread the original row's properties into this object
					tokenId: String(tokenId), // Convert tokenId to a string to ensure consistency
					searchs: null, // Clear the searchs field for this row
					traits: null, // Initialize an empty array for traits
				};

				delete newTokenRow.tokenIds; // Remove the original tokenIds array to avoid redundancy
				processedData.push(newTokenRow); // Return the newly created row object
			});
			// PROCESS TOKENS END

			// PROCESS TRAITS START
			// Convert the JSON-like string format in row.traits to valid JSON by replacing single quotes with double quotes.
			if (row.traits && row.traits !== "") {
				const parsedData = JSON.parse(row.traits.replace(/'/g, '"'));

				// Function to separate traits into string and numeric categories based on the provided dataset.
				function processTraits(dataSet) {
					let stringTraits = [];
					let numericTraits = [];

					// Iterate over each item in the dataset
					dataSet.forEach((item) => {
						if (item.values) {
							// If the item has 'values', treat it as a string trait
							stringTraits.push({
								name: item.name,
								values: item.values,
							});
						} else if (item.ranges) {
							// If the item has 'ranges', treat it as a numeric trait
							numericTraits.push({
								name: item.name,
								ranges: item.ranges,
							});
						}
					});

					return { stringTraits, numericTraits };
				}

				// Map over parsed data to process each trait dataset
				const results = parsedData.map((dataSet) => processTraits(dataSet));

				// Check if results are non-empty and proceed
				if (results && results.length > 0) {
					// Convert the results array into a string and sanitize for valid JSON format
					const sanitizedResults = JSON.stringify(results)
						.replace(/'/g, '"')
						.replace(/\]\[/g, ",");

					let resultsArray;
					try {
						// Attempt to parse the sanitized results string back into an array
						resultsArray = JSON.parse(sanitizedResults);

						// If resultsArray is a valid array and contains elements, proceed with further processing
						if (Array.isArray(resultsArray) && resultsArray.length > 0) {
							// Iterate over each set of results
							for (const resultsQueryArray of resultsArray) {
								// Perform a search for NFTs based on the traits processed earlier
								const searchResults = await searchNFTs(
									row.slug,
									null,
									resultsQueryArray.stringTraits,
									resultsQueryArray.numericTraits
								);

								// For each result from the search, create a new tokenRow object and add it to processedData
								searchResults.forEach((tokenData) => {
									const [tokenId, assetId] = tokenData.split("-");
									const tokenRow = {
										source: "Scheduled", // Label the data source as 'Scheduled'
										...row, // Spread existing row data
										tokenId: String(tokenId), // Ensure tokenId is a string for consistency
										assetId: assetId, // Include the assetId from the split token data
										searchs: null, // Reset the searchs array to indicate processing completion
									};
									processedData.push(tokenRow);
								});
							}
						}
					} catch (error) {
						// Log any JSON parsing errors and halt execution with a failure status
						console.error(
							"Error parsing sanitized results into an array:",
							error
						);
						process.exit(1);
					}
				}
			}
			// PROCESS TRAITS END

			// PROCESS SEARCHS START
			// Check if row.searchs has content and is not just an empty string
			if (row.searchs && row.searchs !== "") {
				// Sanitize the searchs query string by replacing single quotes with double quotes
				// and fixing improperly formatted array strings if necessary.
				const sanitizedsearchs = row.searchs
					.replace(/'/g, '"')
					.replace(/\]\[/g, ",");

				// Convert the sanitized string to a JavaScript array
				let searchsArray;
				try {
					searchsArray = JSON.parse(sanitizedsearchs);
				} catch (error) {
					console.error("Error parsing sanitizedElement into an array:", error);
					process.exit(1); // Exits with a failure code
				}

				// Proceed if searchsArray is a non-empty array
				if (Array.isArray(searchsArray) && searchsArray.length > 0) {
					// Iterate over each searchs query array within the main array
					for (const searchQueryArray of searchsArray) {
						// Check that we have a valid array with at least one search query
						if (
							Array.isArray(searchQueryArray) &&
							searchQueryArray.length > 0
						) {
							// Assume the first element is the search query string
							const searchQuery = searchQueryArray[0];
							console.log(searchQuery);
							if (typeof searchQuery === "string") {
								try {
									// Log the search operation for debugging
									//console.log("Searching for NFTs with query:", searchQuery);

									// Perform the search with the trimmed query string
									const searchResults = await searchNFTs(
										row.slug,
										searchQuery.trim(),
										null,
										null
									);

									// Map each tokenData to a new row object, incorporating search results
									const newRows = searchResults.map((tokenData) => {
										// Parse the tokenData string back into its components
										const [tokenId, assetId] = tokenData.split("-");

										return {
											source: "Scheduled", // Specify the source of the row
											...row,
											tokenId: String(tokenId), // Convert tokenId to string, ensuring consistency
											assetId: assetId, // Include the assetId in the row
											searchs: searchQuery.trim(), // Clear the search field to indicate it's been processed
											traits: null, // Reset stringTraits array
										};
									});

									// Remove tokenIds field from each new row object
									newRows.forEach((newRow) => delete newRow.tokenIds);

									// Add the new rows to the processed data array
									processedData.push(...newRows);
								} catch (error) {
									console.error(
										"Error executing search for query:",
										searchQuery,
										error
									);
									process.exit(1); // Exits with a failure code
								}
							}
						}
					}
				}
			}
			// PROCESS SEARCHS END

			// PROCESS CRITERIA START
			if (row.criteria) {
				// Process collection and trait offer
				const newRow = {
					source: "Scheduled",
					...row,
				};
				delete newRow.tokenIds;
				processedData.push(newRow);
			}
			// PROCESS CRITERIA END

			// Remove tokenIds field from each new row object
			processedData.forEach((row) => delete row.tokenIds);

			logProgress(processedData.length); // Log progress after processing each row
		})
	);

	// Create a Map to store unique tokenId and maxBid for each collection
	const uniqueTokenIdMap = new Map();

	// Create an array to store the unique keys of the rows to keep
	const rowsToKeep = [];

	// Iterate over the processedData array
	processedData.forEach((row) => {
		// Create a unique key for the combination of contractAddress and tokenId or criteria
		const uniqueKey = `${row.contractAddress}:${row.slug}:${
			row.tokenId
		}:${JSON.stringify(row.criteria)}`;
		//console.log(uniqueKey);
		// Check if the uniqueKey already exists in the uniqueTokenIdMap
		if (uniqueTokenIdMap.has(uniqueKey)) {
			const existingRow = uniqueTokenIdMap.get(uniqueKey);
			// If the current row has a higher maxBid, replace the existing row
			if (row.maxBid > existingRow.maxBid) {
				uniqueTokenIdMap.set(uniqueKey, row);
				// Remove the existing row's unique key from rowsToKeep
				const existingRowKey = `${existingRow.contractAddress}:${existingRow.slug}:${existingRow.tokenId}:${existingRow.criteria}`;
				const index = rowsToKeep.indexOf(existingRowKey);
				if (index !== -1) {
					rowsToKeep.splice(index, 1);
				}
				// Add the current row's unique key to rowsToKeep
				rowsToKeep.push(uniqueKey);
			}
		} else {
			// If the uniqueKey doesn't exist, add the new row to the uniqueTokenIdMap
			uniqueTokenIdMap.set(uniqueKey, row);
			// Add the current row's unique key to rowsToKeep
			rowsToKeep.push(uniqueKey);
		}
	});

	// Filter the processedData array to keep only the rows with unique keys in rowsToKeep
	processedData = processedData.filter((row) => {
		const rowKey = `${row.contractAddress}:${row.slug}:${row.tokenId}:${row.criteria}`;
		return rowsToKeep.includes(rowKey);
	});

	await saveProcessedData(
		Array.from(uniqueTokenIdMap.values()),
		uniqueTokenIdMap
	); // Save both processedData and uniqueTokenIdMap
	// Save uniqueBidDataMap to file periodically

	return {
		processedData: Array.from(uniqueTokenIdMap.values()),
		uniqueTokenIdMap,
	}; // Return the processed data and the unique token ID map
}

// Helper function to convert time strings to minutes
function parseTimeToMinutes(timeStr) {
	if (!timeStr) return 0;
	let matches = timeStr.match(/^(\d+)(h|min)$/);
	if (!matches) return 0;

	let [, value, unit] = matches;
	value = parseInt(value, 10);
	return unit === "h" ? value * 60 : value;
}

async function fetchCollectionSlugs(contractAddressesWithChains) {
	const queue = new PQueue({ concurrency: 1.5 * rateLimit }); // Set the concurrency limit
	const slugsMap = {};

	const tasks = contractAddressesWithChains.map(
		({ contractAddress, chain }) => {
			return async () => {
				const data = {
					id: "NavSearchCollectionsQuery",
					query: NavSearchCollectionsQuery,
					variables: {
						query: contractAddress,
					},
				};
				const headers = {
					...base_headers,
					...{ "x-signed-query": x_signed_NavSearchCollectionsQuery },
				};

				try {
					await API_RateLimit(); // Handle API rate limiting
					let response = await axios.post(serverURL, data, {
						headers: headers,
					});
					if (
						response.data &&
						response.data.data.searchCollections.edges.length > 0
					) {
						const firstNode =
							response.data.data.searchCollections.edges[0].node;
						if (
							firstNode.defaultChain.identifier.toLowerCase() ===
							chain.toLowerCase()
						) {
							slugsMap[contractAddress] = firstNode.slug;
							//console.log(`Slug for contract address ${contractAddress} on chain ${chain}: ${firstNode.slug}`);
						}
					}
				} catch (error) {
					console.error(
						`Failed to fetch slug for contract address ${contractAddress} on chain ${chain}:`,
						error
					);
				}
			};
		}
	);

	// Add all tasks to the queue
	tasks.forEach((task) => queue.add(task));

	// Wait until all tasks have completed
	await queue.onIdle();
	return slugsMap;
}

async function findAllTokens(slug) {
	const baseUrl = `https://nfttools.pro/opensea/api/v2/collection/${slug}/nfts`;
	let tokenIds = [];
	let nextCursor = null;
	let url = "";

	do {
		// Construct the URL for each request
		url = `${baseUrl}?limit=200${nextCursor ? `&next=${nextCursor}` : ""}`;

		try {
			const response = await axios.get(url, {
				headers: { ...base_headers },
			});
			const data = response.data;

			// Extract token IDs from the current page, filtering out disabled NFTs
			if (data && data.nfts && data.nfts.length > 0) {
				data.nfts.forEach((nft) => {
					if (!nft.is_disabled) {
						tokenIds.push(parseInt(nft.identifier));
					}
				});
			}

			// Update the cursor for the next page
			nextCursor = data.next || null;
		} catch (err) {
			console.error("Error fetching data:", err.message);
			break; // Exit the loop in case of an error
		}
	} while (nextCursor); // Continue while there is a next page

	// Sort the token IDs numerically from low to high
	tokenIds.sort((a, b) => a - b);
	console.log(tokenIds);
	return tokenIds;
}

async function findMatchingNFTsAndAggregateTraits(row) {
	let slug = row.slug;
	let traitGroups = row.stringTraits;
	let contractAddress = row.contractAddress;
	let finalTokenDetails = []; // Final array of token details that satisfy all conditions
	let aggregatedTraitGroups = []; // Store aggregated trait conditions for each group

	for (let i = 0; i < traitGroups.length; i++) {
		// Aggregate trait conditions within the current group to combine duplicate trait names
		let aggregatedTraitConditions = aggregateTraitConditions(traitGroups[i]);
		aggregatedTraitGroups.push(aggregatedTraitConditions); // Store aggregated conditions for later use

		// Fetch token details for the aggregated trait conditions of the current group
		let tokenDetailsForCurrentGroup = await fetchTokenIdsForTraitConditions(
			slug,
			contractAddress,
			aggregatedTraitConditions
		);

		if (i === 0) {
			// For the first group, initialize finalTokenDetails with the results
			finalTokenDetails = tokenDetailsForCurrentGroup;
		} else {
			// For subsequent groups, intersect based on tokenId to apply AND logic
			let finalTokenIds = new Set(
				finalTokenDetails.map((detail) => detail.tokenId)
			);
			finalTokenDetails = tokenDetailsForCurrentGroup.filter((detail) =>
				finalTokenIds.has(detail.tokenId)
			);
		}
	}

	// Remove tokenIds field from each new row object
	finalTokenDetails.forEach((newRow) => delete newRow.tokenIds);

	// Format the aggregated data as per requirement
	let aggregatedData = finalTokenDetails.map((detail) => ({
		source: "Scheduled",
		...row,
		tokenId: detail.tokenId,
		assetId: detail.assetId,
		searchs: null, // Clear the searchs field
		stringTraits: aggregatedTraitGroups, // Adjust based on actual requirement
		numericTraits: null, // Clear the numericTraits field
	}));

	return aggregatedData;
}

function aggregateTraitConditions(stringTraits) {
	const aggregated = {};
	stringTraits.forEach((trait) => {
		if (!aggregated[trait.name]) {
			aggregated[trait.name] = { name: trait.name, values: [] };
		}
		aggregated[trait.name].values = [
			...new Set([...aggregated[trait.name].values, ...trait.values]),
		];
	});
	return Object.values(aggregated);
}

async function loginToOpenSea() {
	const waitTime = 10000; // 5 seconds

	const waitEndTime = Date.now() + waitTime;

	while (
		loginToOpenSeaInProgress &&
		!openSeaLoginSuccess &&
		Date.now() < waitEndTime
	) {
		if (Console_Only_Errors === "false")
			console.log("Waiting to log in to OpenSea...");
		await delay(1000);
	}

	if (openSeaLoginSuccess) {
		loginToOpenSeaInProgress = false;
		return {
			data: null,
			cookie: base_headers.cookie,
		};
	}

	loginToOpenSeaInProgress = true;

	if (Console_Only_Errors === "false") console.log("Logging in to OpenSea...");

	while (!openSeaLoginSuccess) {
		const challengePostData = {
			id: "challengeLoginMessageQuery",
			query: challengeLoginMessageQuery,
			variables: { address: walletAddress.toLowerCase() },
		};
		let headers = {
			...base_headers, // Include base headers if necessary
			"x-signed-query": x_signed_challengeLoginMessageQuery,
		};

		try {
			// Step 1: Get challenge message from OpenSea
			await API_RateLimit();
			const challengeResponse = await axios.post(serverURL, challengePostData, {
				headers: headers,
			});
			const challengeMessage = challengeResponse.data?.data?.auth?.loginMessage;

			if (!challengeMessage) {
				throw new Error("Failed to retrieve challenge message from OpenSea");
			}

			// Step 2: Sign the challenge message using ethers
			const wallet = new ethers.Wallet(walletPrivateKey);
			const signature = await wallet.signMessage(challengeMessage);

			// Step 3: Submit the signature to OpenSea for verification
			const verifyPostData = {
				id: "authLoginV2AuthSimplifiedMutation",
				query: authLoginV2AuthSimplifiedMutation,
				variables: {
					address: walletAddress.toLowerCase(),
					message: challengeMessage,
					deviceId: generateRandomDeviceId(), // Replace with actual device ID if needed
					signature: signature,
					chain: "ETHEREUM", // Replace with actual chain if different
				},
			};
			headers["x-signed-query"] = x_signed_authLoginV2AuthSimplifiedMutation;
			await API_RateLimit();
			const verifyResponse = await axios.post(serverURL, verifyPostData, {
				headers: headers,
			});

			// Step 4: Capture and return the Set-Cookie header
			const cookies = verifyResponse.headers["set-cookie"];

			if (cookies) {
				const cookieString = cookies
					.map((cookie) => {
						// Extract only the cookie value before the first semicolon, if required
						return cookie.split(";")[0];
					})
					.join("; ");

				// Set the cookie string to the base_headers
				base_headers.cookie = cookieString;

				if (Console_Only_Errors === "false")
					console.log("OpenSea login successful");
				openSeaLoginSuccess = true;
			}

			return {
				data: verifyResponse.data,
				cookie: base_headers.cookie,
			};
		} catch (error) {
			console.error("Error during OpenSea login:", error);
			loginToOpenSeaInProgress = false;
			throw error;
		}
	}
	loginToOpenSeaInProgress = false;
}

async function fetchTokenIdsForTraitConditions(
	slug,
	contractAddress,
	traitConditions
) {
	let allTokenDetails = []; // Store objects with tokenId and assetId
	let hasNextPage = true;
	let cursor = null; // Start with no cursor value for the first request

	while (hasNextPage) {
		const data = {
			id: "CollectionAssetSearchListPaginationQuery",
			query: CollectionAssetSearchListPaginationQuery,
			variables: {
				collections: [slug],
				count: 32,
				cursor: cursor, // Use the current cursor value
				filterOutListingsWithoutRequestedCreatorFees: null,
				numericTraits: null,
				owner: null,
				paymentAssets: null,
				priceFilter: null,
				query: null,
				rarityFilter: null,
				resultModel: "ASSETS",
				safelistRequestStatuses: null,
				shouldShowBestBid: false,
				sortAscending: true,
				sortBy: "UNIT_PRICE",
				stringTraits: traitConditions,
				toggles: null,
			},
		};
		const headers = {
			...base_headers,
			"x-signed-query": x_signed_CollectionAssetSearchListPaginationQuery,
		};

		try {
			await API_RateLimit();
			let response = await axios.post(serverURL, data, { headers: headers });
			if (
				response &&
				response.data &&
				response.data.data &&
				response.data.data.collectionItems
			) {
				const items = response.data.data.collectionItems.edges;
				items.forEach((item) => {
					const node = item.node;
					// Check all conditions before adding
					if (
						!node.isReportedSuspicious &&
						!node.isCompromised &&
						!node.isDelisted &&
						node.isListable &&
						node.assetContract.address.toLowerCase() ==
							contractAddress.toLowerCase()
					) {
						let tokenId = node.tokenId;
						let assetId = node.id; // Assuming assetId is available at this level
						allTokenDetails.push({ tokenId, assetId });
					}
				});

				hasNextPage = response.data.data.collectionItems.pageInfo.hasNextPage;
				cursor = response.data.data.collectionItems.pageInfo.endCursor;
			} else {
				hasNextPage = false; // No more pages to fetch
			}
		} catch (error) {
			console.error(
				"Error fetching matching NFTs with traitConditions:",
				traitConditions
			);
			console.error("Error:", error);
			hasNextPage = false; // Stop on error
		}
	}

	return allTokenDetails; // Return the array of token details
}

async function searchNFTs(
	slug,
	searchQuery = null,
	stringTraits = null,
	numericTraits = null
) {
	// Check that only one of searchQuery, stringTraits, or numericTraits is provided
	const inputs = [searchQuery, stringTraits, numericTraits].filter(
		(input) => input !== null
	);
	if (inputs.length > 2) {
		throw new Error(
			"Only one of searchQuery, stringTraits, or numericTraits may be provided."
		);
	}

	let allTokenIds = new Set(); // Use a Set to avoid duplicate token IDs
	let hasNextPage = true;
	let cursor = null; // Initial cursor is null to fetch the first page
	let isFirstRequest = true; // Flag to indicate it's the first request
	let headers;

	while (hasNextPage) {
		let variables = {
			collections: [slug],
			count: 32,
			numericTraits: numericTraits,
			paymentAssets: null,
			priceFilter: null,
			rarityFilter: null,
			resultModel: "ASSETS",
			sortAscending: true,
			sortBy: "UNIT_PRICE",
			stringTraits: stringTraits,
			toggles: null,
			shouldShowBestBid: false,
			owner: null,
			filterOutListingsWithoutRequestedCreatorFees: null,
		};

		if (searchQuery) {
			variables.query = searchQuery;
		} else {
			variables.query = null; // Ensure this is null if stringTraits or numericTraits are used
		}

		let data = {
			id: isFirstRequest
				? "CollectionAssetSearchListQuery"
				: "CollectionAssetSearchListPaginationQuery",
			query: isFirstRequest
				? CollectionAssetSearchListQuery
				: CollectionAssetSearchListPaginationQuery,
			variables: {
				...variables,
				cursor: cursor, // Add the cursor for pagination on subsequent requests
			},
		};

		headers = {
			...base_headers,
			...{
				"x-signed-query": isFirstRequest
					? x_signed_CollectionAssetSearchListQuery
					: x_signed_CollectionAssetSearchListPaginationQuery,
			},
		};
		isFirstRequest = false; // Update flag after the first request

		try {
			await API_RateLimit(); // Ensure rate limiting
			let response = await axios.post(serverURL, data, { headers: headers });
			if (
				response.data &&
				response.data.data &&
				response.data.data.collectionItems
			) {
				const items = response.data.data.collectionItems.edges;
				items.forEach((item) => {
					const node = item.node;
					if (
						!node.isReportedSuspicious &&
						!node.isCompromised &&
						!node.isDelisted &&
						node.isListable
					) {
						const tokenData = `${node.tokenId}-${node.id}`;
						allTokenIds.add(tokenData);
					}
				});
				hasNextPage = response.data.data.collectionItems.pageInfo.hasNextPage;
				cursor = response.data.data.collectionItems.pageInfo.endCursor;
			} else {
				hasNextPage = false;
			}
		} catch (error) {
			console.error(
				"Error fetching matching NFTs",
				error.response ? error.response.data.errors : error.message
			);
			hasNextPage = false;
		}
	}

	return Array.from(allTokenIds);
}

async function getFloorPrice(slug) {
	const cacheKey = `floorPrice-${slug}`;
	if (floorPriceCache.has(cacheKey)) {
		return floorPriceCache.get(cacheKey);
	}

	try {
		const apiURL = `https://nfttools.pro/opensea/api/v2/listings/collection/${slug}/best?limit=1`;
		const floorPriceResponse = await axios.get(apiURL, {
			headers: base_headers,
		});

		if (
			!floorPriceResponse.data ||
			!floorPriceResponse.data.listings ||
			floorPriceResponse.data.listings.length === 0
		) {
			return null;
		}

		const listing = floorPriceResponse.data.listings[0];
		const ethPrice =
			listing.price.current.value / 10 ** listing.price.current.decimals;

		// Now validate by querying the collection's assets
		const collectionVariables = {
			collections: [slug],
			count: 1,
			numericTraits: null,
			paymentAssets: null,
			priceFilter: null,
			rarityFilter: null,
			resultModel: "ASSETS",
			sortAscending: true,
			sortBy: "UNIT_PRICE",
			stringTraits: null,
			toggles: null,
			shouldShowBestBid: false,
			owner: null,
			filterOutListingsWithoutRequestedCreatorFees: null,
			cursor: null, // For single query, no cursor needed
		};

		const collectionData = {
			id: "CollectionAssetSearchListQuery",
			query: CollectionAssetSearchListQuery, // Your GraphQL query string
			variables: collectionVariables,
		};
		const headers = {
			...base_headers,
			...{ "x-signed-query": x_signed_CollectionAssetSearchListQuery },
		};
		const collectionResponse = await axios.post(serverURL, collectionData, {
			headers: headers,
		});
		if (
			collectionResponse.data &&
			collectionResponse.data.data &&
			collectionResponse.data.data.collectionItems
		) {
			const items = collectionResponse.data.data.collectionItems.edges;
			if (items.length > 0) {
				const node = items[0].node;
				if (
					!node.isReportedSuspicious &&
					!node.isCompromised &&
					!node.isDelisted &&
					node.isListable &&
					parseFloat(node.orderData.bestAskV2.priceType.eth) ===
						parseFloat(ethPrice)
				) {
					const verifiedFloorPrice = ethPrice;
					floorPriceCache.set(cacheKey, verifiedFloorPrice);
					return parseFloat(verifiedFloorPrice.toFixed(4));
				}
			}
		}

		return null;
	} catch (error) {
		console.error(`Error fetching floor price for ${slug}:`, error.message);
		throw error;
	}
}

async function continuouslyProcessOffersInParallel(data) {
	console.log("Processing offers in Parallel...");
	const offerQueue = new PQueue({ concurrency: rateLimit * 1.5 }); // Create a queue with concurrency based on the rate limit
	//console.log(uniqueBidDataMap);
	while (true) {
		// Infinite loop
		try {
			const now = Date.now(); // Get current time once for efficiency
			let processedOffers = false; // Flag to track if any offers have been processed in this round
			let nextProcessTime = Infinity; // Variable to store the earliest next process time

			for (const item of data) {
				// Check if enough time has passed since lastProcessed based on the loop interval
				const loopInterval = 60000 * parseTimeToMinutes(item.loop);
				const nextProcessTimeForItem = item.lastProcessed
					? item.lastProcessed + loopInterval
					: now;

				if (now >= nextProcessTimeForItem) {
					// Add the processing task to the queue
					offerQueue.add(async () => {
						try {
							await waitForQueue(); // Await for any queue processing if applicable
							// Check if the item is already being processed
							const incomingItemKey = `${item.contractAddress}:${item.slug}:${
								item.tokenId
							}:${JSON.stringify(item.criteria)}`; // Create a unique key for the item
							while (processingItems.has(incomingItemKey)) {
								//console.log(`Waiting for bid ${item.contractAddress}#${item.tokenId}`);
								await delay(1000); // Wait for 1 second before retrying
							}
							if (uniqueBidDataMap.has(incomingItemKey)) {
								try {
									// Add the item to the processing set
									processingItems.add(incomingItemKey);
									//console.log(`Processing scheduled bid for ${item.contractAddress}#${item.tokenId}`);

									let item2 = uniqueBidDataMap.get(incomingItemKey);
									item2.source = "Scheduled";
									const { logObject, newItem } = await processItem(item2);

									if (logObject.status === "Success" && !newItem.lastBidOrder) {
										console.log(
											`Offer not found for ${item2.contractAddress}#${
												item2.slug
											}#${item2.tokenId}#${JSON.stringify(item2.criteria)}`
										);
										process.exit(1); // Exit the process if the offer was not found
									}

									if (
										(Console_Only_Errors === "true" &&
											logObject.status != "Success") ||
										Console_Only_Errors === "false"
									) {
										console.log("Offer Status: " + logObject.status);
										console.log(logObject);
									}

									newItem.lastProcessed = Date.now(); // Update lastProcessed to current time after processing
									uniqueBidDataMap.set(incomingItemKey, newItem);
									//console.log({uniqueBidDataMap});
								} finally {
									processingItems.delete(incomingItemKey);
								}
							}

							//await updateBidDataWithNewItem(newItem);

							processedOffers = true; // Set the flag to indicate offers have been processed
						} catch (error) {
							console.error("Error processing offer:", error);
						}
					});
				} else {
					// Update the nextProcessTime if the current item's nextProcessTimeForItem is smaller
					nextProcessTime = Math.min(nextProcessTime, nextProcessTimeForItem);
				}
			}

			// Wait for all the tasks in the queue to complete
			await offerQueue.onIdle();

			if (processedOffers) {
				await cancelOldOffers(); // Cancel old offers after all the offers in the queue have been processed
			} else {
				const waitTime = Math.max(0, nextProcessTime - now);
				const hours = Math.floor(waitTime / 3600000);
				const minutes = Math.floor((waitTime % 3600000) / 60000);
				const seconds = Math.floor((waitTime % 60000) / 1000);

				console.log("No items processed in this round.");
				console.log(
					`Waiting for ${hours} hours, ${minutes} minutes, and ${seconds} seconds until the next item is processed.`
				);
				await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait until the next item is ready to be processed
			}
		} catch (error) {
			console.error("Error in continuouslyProcessOffersInParallel:", error);
		}
	}
}

// Define an async function that wraps your desired operations
async function processTask() {
	//await delay(15000); // Wait for 15 seconds before starting the task
	await cancelOldOffers();
}

// Function to start the scheduled task
function ScheduledBidCleanse() {
	// First execution after 30 minutes
	setTimeout(() => {
		processTask().catch(console.error); // Execute immediately the first time

		// Then repeat every 30 minutes
		setInterval(() => {
			processTask().catch(console.error);
		}, 3 * 60 * 1000);
	}, 3 * 60 * 1000);
}

// Function to process offers sequentially
async function continuouslyProcessOffersSequentially(data) {
	console.log("Processing offers sequentially...");
	while (true) {
		// Infinite loop
		try {
			for (const item of data) {
				try {
					const { logObject, newItem } = await processItem(item);
					if (
						(Console_Only_Errors === "true" && logObject.status != "Success") ||
						Console_Only_Errors === "false"
					) {
						console.log("Offer Status: " + logObject.status);
						console.log(logObject);
					}
					newItem.lastProcessed = Date.now(); // Update lastProcessed to current time after processing
					//await updateBidDataWithNewItem(newItem);
				} catch (error) {
					console.error("Error processing item:", error.message);
				}
			}
			cancelOldOffers();
		} catch (error) {
			console.error(
				"Unexpected error in continuouslyProcessOffersSequentially:",
				error
			);
		}
	}
}

function generateRandomDeviceId() {
	return uuidv4();
}

async function getTokenOwner(contractAddress, tokenId, chain) {
	//Get token owner
	const data = {
		id: "AssetPageQuery",
		query: AssetPageQuery,
		variables: {
			tokenId: tokenId,
			contractAddress: contractAddress,
			chain: chain,
		},
	};
	const headers = {
		...base_headers,
		...{ "x-signed-query": x_signed_AssetPageQuery },
	};

	await API_RateLimit();
	let response = await axios
		.post(serverURL, data, {
			headers: headers,
		})
		.catch((err) => {
			console.log("getTokenOwner function error: " + err.response.data);
			return null;
		});

	if (response.data.data.nft.assetOwners.edges[0]) {
		const owner =
			response.data.data.nft.assetOwners.edges[0].node.owner.address;
		return owner;
	}

	return null;
}

function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

let cancelOldOffersRunning = false;

async function cancelOldOffers() {
	if (cancelOldOffersRunning) {
		return;
	}

	cancelOldOffersRunning = true;

	if (Console_Only_Errors === "false") console.log("Cancelling old offers...");

	try {
		let offers = [];

		offers = await getOffers(5000);
		if (offers.length > 0) {
			// Filter out offers that don't have a matching lastBidOrder.id or relayId in uniqueBidDataMap
			const offersToCancel = offers.filter(
				(offerID) =>
					![...uniqueBidDataMap.values()].some(
						(item) =>
							(item.lastBidOrder && item.lastBidOrder.relay_id === offerID) ||
							(!item.lastBidOrder &&
								item.relayId &&
								item.relayId === offerID) ||
							(item.lastBidOrder && item.lastBidOrder.order_hash)
					)
			);

			if (Console_Only_Errors === "false")
				console.log("Offers to cancel: ", offersToCancel.length);

			if (offersToCancel.length > 0) {
				await cancelOffers(offersToCancel);
				while (isProcessingQueue && offersToCancel.length > 30) {
					//console.log("IN WHILE");
					if (Console_Only_Errors === "false")
						console.log("Waiting for all offers to get cancelled");
					await delay(1000);
				}
				if (Console_Only_Errors === "false")
					console.log(`Cancelled ${offersToCancel.length} old offers.`);
			} else {
				if (Console_Only_Errors === "false")
					console.log("No old offers to cancel.");
			}
		}

		cancelOldOffersRunning = false;
	} catch (error) {
		cancelOldOffersRunning = false;
		console.error("Error in cancelOldOffers:", error);
	}
}

async function cancelAllOffers() {
	if (cancelOldOffersRunning) {
		return;
	}

	cancelOldOffersRunning = true;
	console.log("Cancelling all offers...");

	try {
		let allOffers = [];
		let hasMoreOffers = true;

		while (hasMoreOffers) {
			const offers = await getOffers(1000);
			allOffers.push(...offers);

			if (offers.length > 0) {
				await cancelOffers(offers);
				while (isProcessingQueue && offersToCancel.length > 30) {
					if (Console_Only_Errors === "false")
						console.log("Waiting for all offers to get cancelled");
					await delay(100);
				}
				console.log(`Cancelled ${offers.length} offers.`);
				hasMoreOffers = false;
			} else {
				hasMoreOffers = false;
			}
		}

		console.log(`Total offers cancelled: ${allOffers.length}`);
		cancelOldOffersRunning = false;
	} catch (error) {
		cancelOldOffersRunning = false;
		console.error("Error in cancelAllOffers:", error);
	}
}

async function getOffers(batchSize) {
	let allOffers = [];
	let hasNextPage = true;
	let cursor = null;

	while (hasNextPage && allOffers.length < batchSize) {
		const data = {
			id: "AccountOffersOrderSearchListQuery",
			query: AccountOffersOrderSearchListQuery,
			variables: {
				filterByOrderRules: false,
				isExpired: false,
				makerAssetIsPayment: true,
				collections: [],
				identity: {
					address: walletAddress,
				},
				sortAscending: null,
				includeInvalidBids: true,
				sortBy: "OPENED_AT",
				maker: {
					address: walletAddress,
				},
				orderStatusToggles: null,
				offerTypeToggles: null,
				includeCriteriaOrders: true,
				cursor: cursor,
				count: 32,
			},
		};

		const headers = {
			...base_headers,
			...{ "x-signed-query": x_signed_AccountOffersOrderSearchListQuery },
		};

		try {
			await API_RateLimit();
			let response = await axios.post(serverURL, data, { headers: headers });

			if (
				response.data &&
				response.data.data &&
				response.data.data.orders &&
				response.data.data.orders.edges
			) {
				const offers = response.data.data.orders.edges

					.filter((edge) => edge.node.isValid === true)
					.map((edge) => edge.node.relayId);
				allOffers.push(...offers);

				if (Console_Only_Errors === "false")
					console.log(" Fetched offers:", allOffers.length);

				hasNextPage = response.data.data.orders.pageInfo.hasNextPage;
				cursor = response.data.data.orders.pageInfo.endCursor;
			} else {
				console.log(" Unexpected response structure:", response.data);
			}
		} catch (err) {
			console.log("Error fetching offers: " + err.message);
			return null;
		}
	}

	return allOffers;
}

const offersToCancel = []; // Common array for all offers to be canceled

async function cancelOffers(offers) {
	// Filter out offers that are already in the offersToCancel array
	const newOffers = offers.filter((offer) => !offersToCancel.includes(offer));
	//console.log("     New offers to cancel: ", newOffers.length);
	// Reverse the order of new offers
	const reversedNewOffers = newOffers.slice().reverse();

	// Add new offers to the common array
	offersToCancel.push(...reversedNewOffers);

	// Start processing the queue if not already doing so
	await processQueue();
}

let isProcessingQueue = false;

async function processQueue() {
	//console.log("Processing queue... length: ", offersToCancel.length);
	if (isProcessingQueue || !openSeaLoginSuccess) {
		return;
	}

	isProcessingQueue = true;

	const waitTime = 5000; // 5 seconds
	const maxOffersToProcess = 30;

	while (offersToCancel.length > 0 && openSeaLoginSuccess) {
		// Wait for offers or until the wait time is over
		const waitEndTime = Date.now() + waitTime;
		while (
			offersToCancel.length < maxOffersToProcess &&
			Date.now() < waitEndTime
		) {
			await delay(100); // Wait for a short interval before checking again
		}

		// Process up to 30 offers at a time
		const offersToProcess = offersToCancel.splice(0, maxOffersToProcess);

		const data = {
			id: "useGaslessCancelOrdersMutation",
			query: useGaslessCancelOrdersMutation,
			variables: {
				orders: offersToProcess,
			},
		};

		const headers = {
			...base_headers,
			"x-signed-query": x_signed_useGaslessCancelOrdersMutation,
			"X-AUTH-ADDRESS": walletAddress.toLowerCase(),
		};

		try {
			//for (let i = 0; i < 2; i++) {

			await API_RateLimit();
			if (Console_Only_Errors === "false")
				console.log("     Cancelling offers:", offersToProcess.length);
			axios
				.post(serverURL, data, { headers: headers })
				.then((response) => {
					if (
						response.data &&
						response.data.data &&
						response.data.data.orders
					) {
						const statuses = response.data.data.orders.gaslessCancel.statuses;
						if (Console_Only_Errors === "false")
							console.log("     Cancelled offers:", statuses.length);
						// Process each status to check if the orders are cancelled
						statuses.forEach((status) => {
							if (status.order.isCancelled === true) {
								// Order is cancelled
							} else {
								if (status.order.invalidationReason != "GASLESS_CANCEL") {
									console.log(
										`Order with relayId: ${status.order.relayId} was not cancelled. Reason: ${status.order.invalidationReason}`
									);
								}
							}
						});
					} else {
						console.error("Unexpected response structure:", response.data);
					}
				})
				.catch((err) => {
					console.log(
						"cancelOffers function error: " +
							(err.response ? err.response.data : err.message)
					);
					isProcessingQueue = false;
				});

			//}
		} catch (err) {
			console.log(
				"cancelOffers function error: " +
					(err.response ? err.response.data : err.message)
			);
			isProcessingQueue = false;
		}

		// Wait for a moment before processing the next chunk (if any)
		//await delay((offersToProcess.length * 200) + 1000); // Wait for 2 seconds
	}
	isProcessingQueue = false;
}

async function getAssetId(contractAddress, tokenId, chain) {
	// Ensure AssetPageQuery, base_headers, and x_signed_AssetPageQuery are defined and valid
	const requestData = {
		id: "AssetPageQuery",
		query: AssetPageQuery,
		variables: {
			tokenId: tokenId,
			contractAddress: contractAddress,
			chain: chain,
		},
	};

	const headers = {
		...base_headers,
		"x-signed-query": x_signed_AssetPageQuery,
	};

	try {
		await API_RateLimit();
		let response = await axios.post(serverURL, requestData, {
			headers: headers,
		});

		// Check if the expected data structure is present to avoid runtime errors
		if (
			response.data &&
			response.data.data &&
			response.data.data.nft &&
			response.data.data.nft.id
		) {
			return response.data.data.nft.id;
		} else {
			// Handle cases where the NFT might not be found or other errors are present
			if (response.data && response.data.errors) {
				for (const error of response.data.errors) {
					if (error.message.includes("NFT not found")) {
						console.error(
							`NFT not found for contractAddress: ${contractAddress}, tokenId: ${tokenId}`
						);
						return null;
					}
				}
				// If there are errors but not specifically 'NFT not found'
				console.error("Unexpected errors:", response.data.errors);
			} else {
				console.error("Unexpected response structure:", response.data);
			}
			return null;
		}
	} catch (err) {
		// Differentiate between axios errors and other types of errors
		if (err.response) {
			console.error("getAssetId function network error:", err.response.data);
		} else {
			console.error("getAssetId function error:", err.message);
		}
		return null;
	}
}

async function getTopTokenOfferAPI(slug, tokenId) {
	const apiUrl = `https://nfttools.pro/opensea/api/v2/offers/collection/${slug}/nfts/${tokenId}/best`;

	try {
		await API_RateLimit();
		const response = await axios.get(apiUrl, { headers: base_headers });

		if (response.data && Object.keys(response.data).length > 0) {
			const { order_hash, price, protocol_data } = response.data;
			const { offerer, consideration } = protocol_data.parameters;
			const nftConsideration = consideration.find(
				(item) => item.itemType === 2
			);

			if (
				nftConsideration &&
				(nftConsideration.startAmount > 1 || nftConsideration.endAmount > 1)
			) {
				console.error("NFT consideration amount is greater than 1");
				return ["nft_consideration_error", null, null, null];
			}

			const topOffer = parseFloat(formatUnits(price.value, "ether"));
			const maker = offerer;
			const relayId = order_hash;

			return ["Success", maker, topOffer, relayId];
		} else if (response.data && Object.keys(response.data).length === 0) {
			// No offers, return [null, 0, null]
			if (Console_Only_Errors === "false")
				console.log("No current offers for token:", tokenId);
			return ["Success", null, bidIncrement, null];
		} else {
			console.error("Unexpected response structure:", response.data);
			return ["Error", null, null, null];
		}
	} catch (err) {
		if (
			err.response &&
			err.response.status === 400 &&
			err.response.data.errors
		) {
			const errorMessages = err.response.data.errors;
			const duplicateAssetError = errorMessages.find((error) =>
				error.includes("Multiple assets with the token_id:")
			);

			if (duplicateAssetError) {
				//console.error(duplicateAssetError);
				// Return necessary information to handle the duplicate asset error
				return ["duplicate_asset_error", null, null, null];
			}
		}

		if (err.response) {
			console.error(
				"getTopTokenOffer function network error:",
				err.response.status,
				err.response.data
			);
		} else {
			console.error("getTopTokenOffer function error:", err.message);
		}
		return ["Error", null, null, null];
	}
}

async function getTopTokenOffer(contractAddress, tokenId, assetId, chain) {
	const data = {
		id: "OrdersQuery",
		query: OrdersQuery,
		variables: {
			cursor: null,
			count: 10,
			excludeMaker: null,
			isExpired: false,
			isValid: true,
			includeInvalidBids: null,
			isInactive: null,
			maker: null,
			makerArchetype: null,
			makerAssetIsPayment: true,
			takerArchetype: {
				assetContractAddress: contractAddress,
				tokenId: tokenId,
				chain: chain,
			},
			takerAssetCollections: null,
			takerAssetIsOwnedBy: null,
			takerAssetIsPayment: null,
			sortAscending: null,
			sortBy: "PRICE",
			makerAssetBundle: null,
			takerAssetBundle: null,
			expandedMode: false,
			isBid: true,
			filterByOrderRules: true,
			includeCriteriaOrders: true,
			criteriaTakerAssetId: assetId,
			includeCriteriaTakerAsset: true,
			isSingleAsset: true,
		},
	};

	const headers = { ...base_headers, "x-signed-query": x_signed_OrdersQuery }; // Ensure these are correctly defined

	try {
		await API_RateLimit();
		let response = await axios.post(serverURL, data, { headers: headers });

		// Check if the expected data is not present but errors are
		if (response.data && !response.data.data && response.data.errors) {
			// Log each error message
			response.data.errors.forEach((error) => {
				console.error(`API error for Id: ${assetId} ${error.message}`);
			});
			console.error("API error response:", response.data.errors);
			return [null, null];
		}

		// Check for expected data presence
		if (
			response.data &&
			response.data.data &&
			response.data.data.orders.edges.length > 0
		) {
			const orders = response.data.data.orders.edges.map((edge) => edge.node);
			const topOffer = orders[0].perUnitPriceType.eth; // Assuming the first is the top offer
			const maker = orders[0].maker.address;
			const relayId = orders[0].relayId;

			// Collect IDs of your non-top offers
			const myNonTopOfferIds = orders
				.filter(
					(offer, index) =>
						index !== 0 &&
						offer.maker.address.toLowerCase() === walletAddress.toLowerCase()
				)
				.map((offer) => offer.relayId);

			if (myNonTopOfferIds.length > 0) {
				//console.log(myNonTopOfferIds);
				//console.log(`Cancelling non-top offers: ${myNonTopOfferIds.join(", ")}`);
				cancelOffers(myNonTopOfferIds); // Pass the array of IDs to your cancelOffers function
			} else {
				//console.log("No non-top offers made by my wallet to cancel.");
			}

			return [maker, topOffer, relayId];
		} else {
			//console.log("No current offers for token.");
			//console.log("No current offers for token: " + tokenId);
			return [null, bidIncrement, null];
		}
	} catch (err) {
		if (err.response) {
			// Axios response error handling
			console.error(
				"getTopTokenOffer function network error:",
				err.response.status,
				err.response.data
			);
		} else if (err.request) {
			// The request was made but no response was received
			console.error("getTopTokenOffer function no response:", err.request);
		} else {
			// Something happened in setting up the request that triggered an Error
			console.error("getTopTokenOffer function error:", err.message);
		}
		console.error("getTopTokenOffer function error:", err.config);
		return [null, null, null];
	}
}

async function getTopCollectionOfferAPI(slug, type = null, value = null) {
	//console.log('getTopCollectionOfferAPI function called for collection:', slug + ' with type:', type, 'and value:', value);
	let apiUrl = `https://nfttools.pro/opensea/api/v2/offers/collection/${slug}`;
	const params = new URLSearchParams();

	// Check if type and value are provided to do a trait search
	if (type && value !== null) {
		apiUrl = `https://nfttools.pro/opensea/api/v2/offers/collection/${slug}/traits`;
		params.append("type", type);
		if (!isNaN(value)) {
			// If value is a number, determine if it is a float or an integer
			if (Number(value) === parseFloat(value) && Number(value) % 1 !== 0) {
				params.append("float_value", value); // Handle as a float
			} else {
				params.append("int_value", value); // Handle as an integer
			}
		}
		params.append("value", value); // Handle as a string
	}

	try {
		await API_RateLimit();
		//console.log(apiUrl + '?' + params.toString());
		const response = await axios.get(`${apiUrl}?${params}`, {
			headers: base_headers,
		});

		if (
			response.data &&
			response.data.offers &&
			response.data.offers.length > 0
		) {
			const topOffer = response.data.offers[0];
			const { order_hash, price, protocol_data } = topOffer;
			const { offerer, consideration } = protocol_data.parameters;

			const nftConsideration = consideration.find(
				(item) => item.itemType === 4
			);

			if (
				nftConsideration &&
				(nftConsideration.startAmount > 1 || nftConsideration.endAmount > 1)
			) {
				console.error("NFT consideration amount is greater than 1");
				return ["nft_consideration_error", null, null, null];
			}

			const topOfferPrice = parseFloat(formatUnits(price.value, "ether"));
			const maker = offerer;
			const relayId = order_hash;

			return ["Success", maker, topOfferPrice, relayId];
		} else if (
			response.data &&
			response.data.offers &&
			response.data.offers.length === 0
		) {
			// No offers, return appropriate message
			if (Console_Only_Errors === "false")
				console.log("No current offers for collection:", slug);
			return ["Success", null, 0, null];
		} else {
			console.error("Unexpected response structure:", response.data);
			return ["Error", null, null, null];
		}
	} catch (err) {
		if (err.response) {
			console.error(
				"getTopCollectionOfferAPI function network error:",
				err.response.status,
				err.response.data
			);
		} else {
			console.error("getTopCollectionOfferAPI function error:", err.message);
		}
		return ["Error", null, null, null];
	}
}

// Async function to make an offer on an item.
async function makeOffer(item) {
	// Initialization of variables.
	let clientSignature, serverSignature, clientMessage, orderData, bidOrder;
	let offerResult;
	let parameters;
	try {
		if (item.criteria) {
			// Creating an order for OpenSea if not using the API.
			parameters = await createCollectionBidOrder(walletAddress, item);
			if (parameters) {
				const signature = await signOrder(parameters, item.chain); // Pass the chain value to signOrder
				offerResult = await makeCollectionOffer_API(
					parameters,
					signature,
					item
				);
			} else {
				return { status: "Error", message: "parameters == null", item };
			}
		} else {
			// Creating an order for OpenSea if not using the API.
			parameters = await createTokenBidOrder(walletAddress, item);
			clientSignature = await signOrder(parameters, item.chain); // Pass the chain value to signOrder
			offerResult = await makeTokenOffer_API(parameters, clientSignature, item);
		}

		if (offerResult.status === "Success") {
			if (offerResult.item.source === "Scheduled") {
				estimatorScheduled.recordBid();
			} else {
				estimatorCounter.recordBid();
			}
			recordBidHistory(offerResult.item);
			if (Console_Only_Errors === "false") {
				console.log(
					`Bidding Speed Scheduled: ${estimatorScheduled.calculateBidsPerMinute()} bids/minute`
				);
				console.log(
					`Bidding Speed Counter: ${estimatorCounter.calculateBidsPerMinute()} bids/minute`
				);
				console.log("offerstocancel: " + offersToCancel.length);
			}
		}
		return offerResult;
	} catch (errorResponse) {
		const { message, stack } = errorResponse;
		const errorMessage = `Error processing item: ${JSON.stringify(
			item
		)}\nError details: ${message}\nStack trace: ${stack}`;

		console.error(errorMessage);

		return {
			status: "error",
			message: errorMessage,
			item,
		};
	}
}

function waitForQueue() {
	return new Promise((resolve) => {
		// Check every 100ms if isProcessingQueue is false
		const interval = setInterval(() => {
			if (!cancelOldOffersRunning) {
				clearInterval(interval);
				resolve();
			}
		}, 100); // Check every 100 milliseconds
	});
}

async function makeCollectionOffer_API(parameters, signature, item) {
	try {
		let trait = null;
		if (item.criteria.type) {
			trait = {
				type: item.criteria.type,
				value: item.criteria.value,
			};
		}

		const apiRequestData = {
			protocol_data: {
				parameters: parameters,
				signature: signature,
			},
			criteria: {
				collection: {
					slug: item.slug,
				},
				trait: trait,
			},
			protocol_address: protocol_address,
		};

		const headers = {
			...base_headers,
		};

		await API_RateLimit();
		// Make the API request
		const result = await axios.post(
			"https://nfttools.pro/opensea/api/v2/offers",
			apiRequestData,
			{ headers: headers }
		);
		if (result.data.errors) {
			// Handle errors
			console.error(apiRequestData);
			return {
				status: "Error in function makeCollectionOffer_API:",
				message: result.data.errors[0].message,
				item,
			};
		} else {
			if (result.data.order_hash) {
				if (!item.lastBidOrder) {
					item.lastBidOrder = {};
				}
				item.lastBidOrder.order_hash = result.data.order_hash;
				item.lastBidOrder.current_price = result.data.price.value;
				item.lastBidOrder.expiry = result.data.protocol_data.parameters.endTime;

				return {
					status: "Success",
					message: "Order created successfully.",
					item,
				};
			}
		}

		return {
			status: "Error in function makeCollectionOffer_API:",
			message: "Order response not found",
			item,
		};
	} catch (errorResponse) {
		const { response } = errorResponse;
		const errorData = response ? response.data : errorResponse;
		console.log(errorResponse);
		const errorMessage = `Error in function makeCollectionOffer_API: ${JSON.stringify(
			errorData
		)}`;

		return {
			status: "Error",
			message: errorMessage,
			item,
		};
	}
}

async function makeTokenOffer_API(parameters, clientSignature, item) {
	if (!parameters || !clientSignature || !item || !item.chain) {
		console.error("Invalid input parameters");
		return { status: "Error", message: "Invalid input parameters", item };
	}

	const apiRequestData = {
		parameters: parameters,
		signature: clientSignature,
		protocol_address: protocol_address,
	};

	const headers = {
		...base_headers,
	};

	try {
		await API_RateLimit();
		const result = await axios.post(
			`https://nfttools.pro/opensea/api/v2/orders/${item.chain}/seaport/offers`,
			apiRequestData,
			{ headers: headers }
		);

		if (result.status !== 200) {
			throw new Error(`HTTP error with status code ${result.status}`);
		}

		if (result.data.errors) {
			console.error("API error response:", result.data.errors);
			return { status: "Error", message: result.data.errors[0].message, item };
		}

		if (result.data.order) {
			item.lastBidOrder = item.lastBidOrder || {};
			item.lastBidOrder.relay_id = result.data.order.relay_id;
			item.lastBidOrder.current_price = result.data.order.current_price;
			item.lastBidOrder.expiry = parameters.endTime;

			return {
				status: "Success",
				message: "Order created successfully.",
				item,
			};
		} else {
			return { status: "Error", message: "Order response not found", item };
		}
	} catch (errorResponse) {
		if (axios.isAxiosError(errorResponse) && errorResponse.response) {
			// console.error('API request failed:', errorResponse.response.data);
			const errorMessage = `HTTP status ${
				errorResponse.response.status
			}: ${JSON.stringify(errorResponse.response.data)}`;
			return {
				status: "Error",
				message: errorMessage,
				item,
			};
		} else {
			console.error("Unexpected error:", errorResponse);
			return {
				status: "Error",
				message: `Unexpected error: ${errorResponse.message || errorResponse}`,
				item,
			};
		}
	}
}

async function signMessage(clientMessage) {
	const parsedClientMessage = JSON.parse(clientMessage);

	try {
		delete parsedClientMessage.types.EIP712Domain;
		const domain = parsedClientMessage.domain;
		const types = parsedClientMessage.types;
		const message = parsedClientMessage.message;
		return await wallet.signTypedData(domain, types, message);
	} catch (error) {
		console.error("Error signing the message: ", error);
		return null;
	}
}

// MAIN PROCESSING FUNCTION
async function processItem(item) {
	const chainData = await getChainData(item.chain);
	const nativeCurrencySymbol = chainData
		? chainData.wrappedCurrency.symbol
		: "WETH";
	// Initialize a structured log object to record the process flow and outcomes
	let logObject = {
		source: item.source,
		contractAddress: item.contractAddress,
		slug: item.slug,
		tokenId: item.tokenId, // Include initially
		criteria: item.criteria, // Include initially
		bidAmount: "0" + " " + nativeCurrencySymbol, // Initialize with a default value
		accountAddress: walletAddress,
		duration: item.duration,
		status: "",
		message: "",
	};

	// Delete tokenId if it's null
	if (logObject.tokenId == null) {
		delete logObject.tokenId;
	}

	// Delete criteria if it's null
	if (logObject.criteria == null) {
		delete logObject.criteria;
	}

	let newItem = item;
	let result, maker, topOffer;
	let relayId;
	try {
		// Safety measure: Reset bidAmount to prevent unintended reuse
		newItem.bidAmount = 0;
		item.relayId = null;

		// Check if the wallet owns the asset and should skip making an offer
		if (offer_on_own_asset === "false") {
			const owner = await getTokenOwner(
				newItem.contractAddress,
				newItem.tokenId,
				newItem.chain
			);
			if (owner.toLowerCase() === walletAddress.toLowerCase()) {
				logObject.status = "Skipped";
				logObject.message = "Asset is owned by the wallet";
				return { logObject, newItem };
			}
		}

		// Set bid range for trial mode
		if (trial_mode === "true") {
			newItem.minBid = 0.0025; // 0.0025 ETH in Wei
			newItem.maxBid = 0.003; // 0.003 ETH in Wei
		}

		// Validate that minimum bid is less than maximum bid
		if (newItem.minBid >= newItem.maxBid) {
			logObject.status = "Error";
			logObject.message = "minBid is greater than or equal to maxBid";
			return { logObject, newItem };
		}

		// Fetch the top offer details for the given asset
		if (newItem.source === "Scheduled") {
			if (newItem.criteria) {
				[result, maker, topOffer, relayId] = await getTopCollectionOfferAPI(
					newItem.slug,
					newItem.criteria.type,
					newItem.criteria.value
				);
				//console.log({result, maker, topOffer, relayId});
			} else {
				[result, maker, topOffer, relayId] = await getTopTokenOfferAPI(
					newItem.slug,
					newItem.tokenId
				);

				if (
					result === "duplicate_asset_error" ||
					result === "nft_consideration_error" ||
					result === "Error" ||
					result === null
				) {
					// Retrieve asset ID if not already present
					if (!newItem.assetId) {
						newItem.assetId = await getAssetId(
							newItem.contractAddress,
							newItem.tokenId,
							newItem.chain
						);
						if (!newItem.assetId) {
							logObject.status = "Error";
							logObject.message = "Error fetching top offer details";
							return { logObject, newItem };
						}
					}
					[maker, topOffer, relayId] = await getTopTokenOffer(
						newItem.contractAddress,
						newItem.tokenId,
						newItem.assetId,
						newItem.chain
					);
				}
			}
			if (!maker && !topOffer) {
				logObject.status = "Error";
				logObject.message = "Error fetching top offer details";
				return { logObject, newItem };
			}

			newItem.topOffer = topOffer;

			if (topOffer > bidIncrement) {
				if (newItem.topOffer > topOffer) {
					logObject.status = "Skipped";
					logObject.message =
						"Our Top offer is higher than the return top offer";
					return { logObject, newItem };
				}

				// Additional validation to ensure 'maker' is a valid Ethereum address
				if (!ethers.isAddress(maker) && topOffer) {
					logObject.status = "Error";
					logObject.message = "Maker is not a valid Ethereum address";
					return { logObject, newItem };
				}

				// Skip making an offer if the wallet is already the top offer and configured to not outbid itself
				if (
					outbid_on_own_offer === "false" &&
					maker.toLowerCase() === walletAddress.toLowerCase()
				) {
					logObject.status = "Skipped";
					logObject.message = "Top offer wallet is ours, SKIP offer";
					newItem.relayId = relayId;
					return { logObject, newItem };
				}
			}
		}

		if (newItem.source === "Counter Offer") {
			topOffer = newItem.topOffer;
		}

		newItem.floorPrice = await getFloorPrice(newItem.slug);

		// Ensure topOffer is a valid bid (non-zero and numeric)
		if (
			(isNaN(newItem.floorPrice) || newItem.floorPrice <= 0) &&
			(newItem.minFloor || newItem.maxFloor)
		) {
			logObject.status = "Error";
			logObject.message = "Floor Price is not a valid value";
			return { logObject, newItem };
		}

		// Check if either parsed value is NaN
		if (
			isNaN(newItem.floorPrice) ||
			newItem.floorPrice <= 0 ||
			isNaN(newItem.minFloor) ||
			newItem.minFloor <= 0
		) {
			newItem.minFloorBid = newItem.minBid;
		} else {
			// Calculate minFloorBid if both numbers are valid
			newItem.minFloorBid = parseFloat(
				((newItem.floorPrice * newItem.minFloor) / 100).toFixed(4)
			);
		}
		// Ensure topOffer is a valid bid (non-zero and numeric)
		if (isNaN(newItem.minFloorBid) || newItem.minFloorBid <= 0) {
			logObject.status = "Error";
			logObject.message = "min Floor Bid is not a valid value";
			return { logObject, newItem };
		}

		// Check if either parsed value is NaN
		if (
			isNaN(newItem.floorPrice) ||
			newItem.floorPrice <= 0 ||
			isNaN(newItem.maxFloor) ||
			newItem.maxFloor <= 0
		) {
			newItem.maxFloorBid = newItem.maxBid;
		} else {
			// Calculate minFloorBid if both numbers are valid
			newItem.maxFloorBid = parseFloat(
				((newItem.floorPrice * newItem.maxFloor) / 100).toFixed(4)
			);
		}
		// Ensure topOffer is a valid bid (non-zero and numeric)
		if (isNaN(newItem.maxFloorBid) || newItem.maxFloorBid <= 0) {
			logObject.status = "Error";
			logObject.message = "max Floor Bid is not a valid value";
			return { logObject, newItem };
		}

		// Ensure topOffer is a valid bid (non-zero and numeric)
		const topOfferNumber = parseFloat(topOffer);
		if (isNaN(topOfferNumber) || topOfferNumber <= 0) {
			logObject.status = "Error";
			logObject.message = "Top offer is not a valid bid";
			return { logObject, newItem };
		}
		// Determine the appropriate bid amount based on current top offer
		if (topOffer && parseFloat(topOffer) >= newItem.minBid) {
			if (
				topOffer >=
				Math.min(newItem.maxBid, newItem.maxFloorBid || newItem.maxBid)
			) {
				if (offer_max_when_outbid === "true") {
					newItem.bidAmount = Math.min(
						newItem.maxBid,
						newItem.maxFloorBid || newItem.maxBid
					); // Offer maximum bid when outbid
				} else {
					//console.log({newItem});
					logObject.status = "Skipped";
					logObject.message =
						"Top offer too high to outbid: " +
						parseFloat(topOffer).toFixed(4) +
						" " +
						nativeCurrencySymbol;
					try {
						// Cancel the previous bid offer if it exists
						if (newItem.lastBidOrder && newItem.lastBidOrder.relay_id) {
							//console.log("Cancelling previous bid offer... ") + newItem.lastBidOrder.relay_id;
							cancelOffers([newItem.lastBidOrder.relay_id]);
							newItem.lastBidOrder = null;
						}
						newItem.lastBidOrder = null;
					} catch (error) {
						console.error("Error setting lastBidOrder to null:", error);
					}
					return { logObject, newItem };
				}
			} else {
				// Increase bid by the increment above the top offer
				newItem.bidAmount = (
					parseFloat(topOffer) + parseFloat(bidIncrement)
				).toFixed(4);
			}
		} else {
			// If no top offer or below minBid, start with minBid
			newItem.bidAmount = Math.max(
				newItem.minBid,
				newItem.minFloorBid || newItem.minBid
			);
		}

		// Cancel the previous bid offer if it exists
		if (newItem.lastBidOrder && newItem.lastBidOrder.relay_id) {
			//console.log("Cancelling previous bid offer... ") + newItem.lastBidOrder.relay_id;
			cancelOffers([newItem.lastBidOrder.relay_id]);
			newItem.lastBidOrder = null;
		}
		//console.log(newItem);
		//process.exit(0);
		const offerResult = await makeOffer(newItem);
		newItem = offerResult.item;

		// Update log with the result of the bid offer
		logObject.bidAmount = newItem.bidAmount + " " + nativeCurrencySymbol;
		logObject.status = offerResult.status;
		logObject.message = offerResult.message;

		return { logObject, newItem }; // Return the log object for external use or verification
	} catch (error) {
		// Capture and log any errors encountered during the process
		console.error(error);
		logObject.status = "Error in ProcessItem";
		logObject.message = error.message;
		console.error("Error Status: " + logObject.status);
		console.error(logObject);
		return { logObject, newItem };
	}
}

// Assuming item.bidAmount is a numeric or string value representing ETH with possible decimal points
function convertEthToWei(ethAmount) {
	const [integerPart, decimalPart = ""] = ethAmount.toString().split(".");
	const paddedDecimalPart = decimalPart.padEnd(18, "0");
	const weiString = integerPart + paddedDecimalPart.slice(0, 18); // Ensure only up to 18 decimal places
	return BigInt(weiString).toString();
}

async function createCollectionBidOrder(makerAddress, item) {
	let parameters;

	try {
		// Convert bidAmount in ETH to Wei
		const ethQuantityWei = convertEthToWei(item.bidAmount);

		// Filter taker fees that are required
		const takerFees = item.fees
			.filter((fee) => fee.required)
			.map((fee) => ({
				address: fee.recipient,
				basis_points: fee.fee * 100, // Convert percentage to basis points
			}));

		// Function to calculate fee with rounding up
		const calculateFeeWithRounding = (bidAmountWei, basisPoints) => {
			const divisor = BigInt(10000);
			// Convert bidAmountWei and basisPoints to BigInt
			const bidAmountWeiBigInt = BigInt(bidAmountWei);
			const basisPointsBigInt = BigInt(basisPoints);

			// Calculate the fee, ensuring it rounds up
			const feeWithoutRounding = bidAmountWeiBigInt * basisPointsBigInt;
			const feeWithRounding =
				(feeWithoutRounding + divisor - BigInt(1)) / divisor;

			return feeWithRounding.toString();
		};

		const wrappedCurrencyAddress = await getWrappedCurrencyAddress(item.chain);

		// Build the trait offer using the OpenSea API
		let trait = null;
		if (item.criteria.type) {
			trait = {
				type: item.criteria.type,
				value: item.criteria.value,
			};
		}

		const buildOfferData = {
			quantity: 1,
			criteria: {
				collection: { slug: item.slug },
				trait: trait,
			},
			offer_protection_enabled: true,
			protocol_address: protocol_address,
			offerer: makerAddress,
		};

		const headers = {
			...base_headers,
		};
		const buildOfferResponse = await axios.post(
			"https://nfttools.pro/opensea/api/v2/offers/build",
			buildOfferData,
			{ headers: headers }
		);
		const partialParameters = buildOfferResponse.data.partialParameters;

		parameters = {
			...partialParameters,
			offerer: toChecksumAddress(makerAddress),
			offer: [
				{
					itemType: 1, // Assuming ERC20 for ETH
					token: toChecksumAddress(wrappedCurrencyAddress),
					identifierOrCriteria: "0",
					startAmount: ethQuantityWei,
					endAmount: ethQuantityWei,
				},
			],
			consideration: [
				...partialParameters.consideration,
				...takerFees.map((fee) => ({
					itemType: 1, // Assuming ERC20 for fee payments
					token: toChecksumAddress(wrappedCurrencyAddress),
					identifierOrCriteria: "0",
					startAmount: calculateFeeWithRounding(
						ethQuantityWei,
						fee.basis_points
					),
					endAmount: calculateFeeWithRounding(ethQuantityWei, fee.basis_points),
					recipient: toChecksumAddress(fee.address),
				})),
			],
			startTime: Math.floor(Date.now() / 1000).toString(),
			endTime: (
				Math.floor(Date.now() / 1000) +
				60 * parseTimeToMinutes(item.duration)
			).toString(),
			orderType: 3, // Assuming a specific order type for OpenSea
			zone: zone,
			zoneHash:
				"0x0000000000000000000000000000000000000000000000000000000000000000",
			salt: "0x0", //generateSalt(), // This should be a unique salt for the order, possibly a random value
			conduitKey: conduitKey,
			totalOriginalConsiderationItems:
				partialParameters.consideration.length + takerFees.length,
			counter: 0,
		};
	} catch (error) {
		console.error("Error creating trait offer: ", error.response.data);
		return null;
	}

	return parameters;
}

async function createTokenBidOrder(makerAddress, item) {
	// Convert bidAmount in ETH to Wei
	const ethQuantityWei = convertEthToWei(item.bidAmount);
	//console.log('ETH Quantity in Wei: ' + ethQuantityWei);
	// Filter taker fees that are required
	const takerFees = item.fees
		.filter((fee) => fee.required)
		.map((fee) => ({
			address: fee.recipient,
			basis_points: fee.fee * 100, // Convert percentage to basis points
		}));

	// Function to calculate fee with rounding up
	const calculateFeeWithRounding = (bidAmountWei, basisPoints) => {
		//console.log('Basis Points: ' + basisPoints);
		//console.log('Bid Amount in Wei: ' + bidAmountWei);
		const divisor = BigInt(10000);
		// Convert bidAmountWei and basisPoints to BigInt
		const bidAmountWeiBigInt = BigInt(bidAmountWei);
		const basisPointsBigInt = BigInt(basisPoints);

		// Calculate the fee, ensuring it rounds up
		const feeWithoutRounding = bidAmountWeiBigInt * basisPointsBigInt;
		const feeWithRounding =
			(feeWithoutRounding + divisor - BigInt(1)) / divisor;

		//console.log(feeWithRounding.toString());
		return feeWithRounding.toString();
	};

	let wrappedCurrencyAddress = await getWrappedCurrencyAddress(item.chain);

	const parameters = {
		offerer: toChecksumAddress(makerAddress),
		offer: [
			{
				itemType: 1, // Assuming ERC20 for ETH
				token: toChecksumAddress(wrappedCurrencyAddress), // Get the wrapped currency address based on the chain
				identifierOrCriteria: "0",
				startAmount: ethQuantityWei,
				endAmount: ethQuantityWei,
			},
		],
		consideration: [
			{
				itemType: item.tokenStandard === "erc1155" ? 3 : 2, // Use itemType "3" for ERC-1155, "2" for ERC-721
				token: toChecksumAddress(item.contractAddress),
				identifierOrCriteria: item.tokenId,
				startAmount: "1",
				endAmount: "1",
				recipient: toChecksumAddress(makerAddress),
			},
		].concat(
			takerFees.map((fee) => ({
				itemType: 1, // Assuming ERC20 for fee payments
				token: toChecksumAddress(wrappedCurrencyAddress), // Get the wrapped currency address based on the chain
				identifierOrCriteria: "0",
				startAmount: calculateFeeWithRounding(ethQuantityWei, fee.basis_points), // Use the rounding function
				endAmount: calculateFeeWithRounding(ethQuantityWei, fee.basis_points), // Same as startAmount
				recipient: toChecksumAddress(fee.address),
			}))
		),
		startTime: Math.floor(Date.now() / 1000).toString(),
		endTime: (
			Math.floor(Date.now() / 1000) +
			60 * parseTimeToMinutes(item.duration)
		).toString(),
		orderType: 2, // Assuming a specific order type for OpenSea
		zone: zone, // Get the zone address based on the chain
		zoneHash:
			"0x0000000000000000000000000000000000000000000000000000000000000000",
		salt: generateSalt(), // This should be a unique salt for the order, possibly a random value
		conduitKey: conduitKey, // Get the conduit key based on the chain
		totalOriginalConsiderationItems: takerFees.length + 1, // +1 for the NFT itself
		counter: 0,
	};

	return parameters;
}

async function getWrappedCurrencyAddress(chain) {
	const chainData = await getChainData(chain);
	return chainData ? chainData.wrappedCurrency.address : null;
}

let chainDataCache = null;

async function getChainData(chain) {
	if (!chainDataCache) {
		try {
			const fileContent = await fs.readFile("chains.json", "utf8");
			chainDataCache = JSON.parse(fileContent);
		} catch (error) {
			console.error("Error reading chains.json:", error);
			return null;
		}
	}

	return chainDataCache.find(
		(c) => c.identifier.toLowerCase() === chain.toLowerCase()
	);
}

function getChainId(chain) {
	switch (chain) {
		case "ethereum":
			return 1;
		case "matic":
			return 137;
		case "klaytn":
			return 8217;
		case "bsc":
			return 56;
		case "arbitrum":
			return 42161;
		case "arbitrum_nova":
			return 42170;
		case "avalanche":
			return 43114;
		case "optimism":
			return 10;
		case "solana":
			return null; // Solana does not use chain IDs
		case "base":
			return 8453;
		case "zora":
			return 7777777; // Zora does not use chain IDs
		case "blast":
			return 81457;
		default:
			throw new Error(`Unsupported chain: ${chain}`);
	}
}

function generateSalt() {
	// Generate a 32-byte random value
	const buffer = crypto.randomBytes(32);
	// Convert buffer to a BigInt, ensuring it is treated as an unsigned integer
	const bigInt = BigInt("0x" + buffer.toString("hex"));
	// Return the BigInt as a string
	return bigInt.toString();
}

function toChecksumAddress(address) {
	//console.log({address});
	address = address.toLowerCase().replace(/^0x/, "");
	const hash = keccak256(address);

	let checksumAddress = "0x";
	for (let i = 0; i < address.length; i++) {
		// Convert the ith character to uppercase if the ith digit of the hash is greater than 7
		checksumAddress +=
			parseInt(hash[i], 16) > 7 ? address[i].toUpperCase() : address[i];
	}
	return checksumAddress;
}

function recordBidHistory(item) {
	// Create a new history object from the item information
	const bidHistoryItem = {
		source: item.source,
		slug: item.slug,
		contractAddress: item.contractAddress,
		tokenId: item.tokenId || "N/A", // Assuming traits might not be available
		traits: item.traits || "N/A", // Assuming traits might not be available
		minBid: item.minBid,
		maxBid: item.maxBid,
		bidAmount: item.bidAmount,
		duration: item.duration,
		timestamp: Date.now(), // Capture the current timestamp for "Time Ago"
	};

	// Push the new history item to the biddingHistory array
	biddingHistory.push(bidHistoryItem);

	// Limit the size of biddingHistory to keep the last 50 bids
	if (biddingHistory.length > 50) {
		biddingHistory.shift(); // Remove the oldest bid history item
	}
}

async function signOrder(parameters, chain) {
	const chainId = getChainId(chain);

	const typedMessage = {
		types: {
			EIP712Domain: [
				{
					name: "name",
					type: "string",
				},
				{
					name: "version",
					type: "string",
				},
				{
					name: "chainId",
					type: "uint256",
				},
				{
					name: "verifyingContract",
					type: "address",
				},
			],
			OrderComponents: [
				{
					name: "offerer",
					type: "address",
				},
				{
					name: "zone",
					type: "address",
				},
				{
					name: "offer",
					type: "OfferItem[]",
				},
				{
					name: "consideration",
					type: "ConsiderationItem[]",
				},
				{
					name: "orderType",
					type: "uint8",
				},
				{
					name: "startTime",
					type: "uint256",
				},
				{
					name: "endTime",
					type: "uint256",
				},
				{
					name: "zoneHash",
					type: "bytes32",
				},
				{
					name: "salt",
					type: "uint256",
				},
				{
					name: "conduitKey",
					type: "bytes32",
				},
				{
					name: "counter",
					type: "uint256",
				},
			],
			OfferItem: [
				{
					name: "itemType",
					type: "uint8",
				},
				{
					name: "token",
					type: "address",
				},
				{
					name: "identifierOrCriteria",
					type: "uint256",
				},
				{
					name: "startAmount",
					type: "uint256",
				},
				{
					name: "endAmount",
					type: "uint256",
				},
			],
			ConsiderationItem: [
				{
					name: "itemType",
					type: "uint8",
				},
				{
					name: "token",
					type: "address",
				},
				{
					name: "identifierOrCriteria",
					type: "uint256",
				},
				{
					name: "startAmount",
					type: "uint256",
				},
				{
					name: "endAmount",
					type: "uint256",
				},
				{
					name: "recipient",
					type: "address",
				},
			],
		},
		primaryType: "OrderComponents",
		domain: {
			name: "Seaport",
			version: "1.6",
			chainId: chainId,
			verifyingContract: "0x0000000000000068F116a894984e2DB1123eB395",
		},
		message: parameters,
	};
	try {
		const str = JSON.stringify(typedMessage);
		return await signMessage(str);
	} catch (error) {
		console.error("Error signing the message: ", error);
		return null;
	}
}
