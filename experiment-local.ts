import { IndexedTx, SigningStargateClient, StargateClient } from "@cosmjs/stargate"
import { Tx } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx"
import { readFile } from "fs/promises"
import { DirectSecp256k1Wallet, OfflineDirectSigner } from "@cosmjs/proto-signing"
import { fromHex } from "@cosmjs/encoding"


const rpc = "http://127.0.0.1:26657"

const ADDR_ALICE = "cosmos1ymcwj2xk0k786phq90vg20s5uupxwr55fzgl77"
const faucet: string = "cosmos1umpxwaezmad426nt7dx3xzv5u0u7wjc0kj7ple" // Bob

const runAll = async(): Promise<void> => {
    // initialize the connection and immediately check it
    const client = await StargateClient.connect(rpc)
    console.log("With client, chain id:", await client.getChainId(), ", height:", await client.getHeight())

    // Display account balance
    console.log(
        "Alice balances:",
        await client.getAllBalances(ADDR_ALICE),
    )

    // Review faucet transaction
    const faucetTx: IndexedTx = (await client.getTx(
        "9EDABB7B3F8047B9FE64CE08786343B34DDFA4F314FFAFDBCFB7D377DF11E9D4",
    ))!
    console.log("\nFaucet Tx:", faucetTx)
    // Decode the tx 
    const decodedTx: Tx = Tx.decode(faucetTx.tx)
    console.log("\nFaucetDecodedTx:", decodedTx)

    // Decode the Tx message
    console.log("\nnFaucetDecodedTx messages:", decodedTx.body!.messages)

    const sendMessage: MsgSend = MsgSend.decode(decodedTx.body!.messages[0].value)
    console.log("\nSent message:", sendMessage)

    const faucet: string = sendMessage.fromAddress
    console.log("\nFaucet balances:", await client.getAllBalances(faucet))

    // Get the faucet address another way: via the emitted Event
    {
        const rawLog = JSON.parse(faucetTx.rawLog)
        //console.log("\n\nRaw log:", JSON.stringify(rawLog, null, 4))
        const faucet: string = rawLog[0].events
            .find((eventEl: any) => eventEl.type === "coin_spent")
            .attributes.find((attribute: any) => attribute.key === "spender").value
        console.log("\nFaucet address from raw log:", faucet)
    }

    // == Sending a signed Transaction

    // Signer from the locally generated mnemonic file + HD Wallet OfflineDirectSigner 
    const getAliceSignerFromPriKey = async(): Promise<OfflineDirectSigner> => {
        return DirectSecp256k1Wallet.fromKey(
            fromHex((await readFile("./simd.alice.private.key")).toString()),
            "cosmos",
        )
    }
    
    const aliceSigner: OfflineDirectSigner = await getAliceSignerFromPriKey()

    const alice = (await aliceSigner.getAccounts())[0].address
    console.log("\nAlice's address from signer: \n"+ alice +"\n"+ADDR_ALICE)

    // Signing client
    const signingClient = await SigningStargateClient.connectWithSigner(rpc, aliceSigner)

    // Test the signing client
    console.log(
        "\nWith signing client, chain id: ",
        await signingClient.getChainId(),
        ", height: ",
        await signingClient.getHeight()
    )
    
    // == Sending tokens
    console.log("\nGas fee:", decodedTx.authInfo!.fee!.amount)
    console.log("Gas limit:", decodedTx.authInfo!.fee!.gasLimit.toString(10))

    // Check the balance of Alice and the Faucet
    console.log("\nAlice balance before:", await client.getAllBalances(alice))
    console.log("Faucet balance before:", await client.getAllBalances(faucet))

    // Execute the sendTokens Tx and store the result
    const result = await signingClient.sendTokens(
        alice,
        faucet,
        [{ denom: "stake", amount: "100000" }],
        {
            amount: [{ denom: "stake", amount: "1000" }],
            gas: "200000",
        },
    )

    // Output the result of the Tx
    console.log("\nToken Transfer result:", result)

    console.log("\nAlice balance after:", await client.getAllBalances(alice))
    console.log("Faucet balance after:", await client.getAllBalances(faucet))

}


runAll()