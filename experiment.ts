import { GasPrice, IndexedTx, SigningStargateClient, StargateClient } from "@cosmjs/stargate"
import { Tx } from "cosmjs-types/cosmos/tx/v1beta1/tx"
import { MsgSend } from "cosmjs-types/cosmos/bank/v1beta1/tx"
import { readFile } from "fs/promises"
import { DirectSecp256k1HdWallet, OfflineDirectSigner } from "@cosmjs/proto-signing"


const rpc = "rpc.sentry-01.theta-testnet.polypore.xyz:26657"

const ADDR_ALICE = "cosmos1ymcwj2xk0k786phq90vg20s5uupxwr55fzgl77"

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
    const getAliceSignerFromMnemonic = async (): Promise<OfflineDirectSigner> => {
        return DirectSecp256k1HdWallet.fromMnemonic((await readFile("./testnet.alice.mnemonic.key")).toString(), {
            prefix: "cosmos",
        })
    }
    
    const aliceSigner: OfflineDirectSigner = await getAliceSignerFromMnemonic()

    const alice = (await aliceSigner.getAccounts())[0].address
    console.log("\nAlice's address from signer: \n"+ alice +"\n"+ADDR_ALICE)

    // Signing client
    const signingClient = await SigningStargateClient.connectWithSigner(
        rpc, 
        aliceSigner
        , {
            prefix: "cosmos",
            gasPrice: GasPrice.fromString("0.0025uatom")
        }
    )

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
        [{ denom: "uatom", amount: "100000" }],
        {
            amount: [{ denom: "uatom", amount: "1000" }],
            gas: "200000",
        },
    )

    // Output the result of the Tx
    console.log("\nToken Transfer result via sentTokens:", result)

    const validator: string = "cosmosvaloper178h4s6at5v9cd8m9n7ew3hg7k9eh0s6wptxpcn" //01node

    // == Multiple sned - Sign & Broadcast - Recommended Alternative
    const result_multi = await signingClient.signAndBroadcast(
        // the signerAddress
        alice,
        // the message(s)
        [
            // message #1: transfer token
            {
                typeUrl: "/cosmos.bank.v1beta1.MsgSend",
                value: {
                    fromAddress: alice,
                    toAddress: faucet,
                    amount: [
                        { denom: "uatom", amount: "100000" },
                    ],
                },
            },
            // message #2: stake tokens
            {
                typeUrl: "/cosmos.staking.v1beta1.MsgDelegate",
                value: {
                    delegatorAddress: alice,
                    validatorAddress: validator,
                    amount: { denom: "uatom", amount: "1000", },
                },
              },
        ],
        // the fee
        "auto",
        // {
        //     amount: [{ denom: "uatom", amount: "1000" }],
        //     gas: "200000",
        // },
    )
    // Output the result of the Tx
    console.log("\nToken Transfer result via signAndBroadcast:", result_multi)

    console.log("\nAlice balance after:", await client.getAllBalances(alice))
    console.log("Faucet balance after:", await client.getAllBalances(faucet))
}


runAll()