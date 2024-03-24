import readline from 'readline';
import { exec } from 'child_process';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function removeWalletFile() {
  console.log('\x1b[31m%s\x1b[0m', "WARNING: Deleting your private key could lead to loss of funds!");

  rl.question("Are you sure you want to delete the wallet file? (yes/no): ", (answer) => {
    if (answer.toLowerCase() === 'yes') {
      exec(`rm ${__dirname}/wallet.json`, (error, stdout, stderr) => {
        if (error) {
          console.error(`Error removing wallet file: ${error.message}`);
          return;
        }
        if (stderr) {
          console.error(`stderr: ${stderr}`);
          return;
        }
        console.log(`Wallet file removed successfully.`);
      });
    } else if (answer.toLowerCase() === 'no') {
      console.log("Operation cancelled.");
    } else {
      console.log("Invalid input. Please enter 'yes' or 'no'.");
    }
    rl.close();
  });
}

removeWalletFile();
