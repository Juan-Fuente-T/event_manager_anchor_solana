import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { EventManager } from "../target/types/event_manager";
import { BN } from "bn.js";
import { Keypair, PublicKey } from '@solana/web3.js';
import { createMint, createFundedWallet, createAssociatedTokenAccount } from './utils';
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { assert } from "chai";


describe("event-manager", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.EventManager as Program<EventManager>;

  // event accounts address
  let acceptedMint: PublicKey;

  // PDAs
  let eventPublicKey: PublicKey;
  let eventMint: PublicKey;
  let treasuryVault: PublicKey;
  let gainVault: PublicKey;

  //sponsor
  let alice: Keypair; //alice key pair
  let aliceAcceptedMintATA: PublicKey;//alice accepted mint ATA (associated token account)
  let aliceEventMintATA: PublicKey; //alice event mint ATA (associated token account)

  // provider (event organizer) wallet 
  let walletAcceptedMintATA: PublicKey; //provider wallet accepted mint ATA

  //another Sponsor 
  let bob: Keypair; //bob key pair
  let bobAcceptedMintATA: PublicKey;//bob accepted mint ATA (associated token account)
  let bobEventMintATA: PublicKey; //bob event mint ATA (associated token account)


  // all this must exists **before** calling our program instructions
  before(async () => {
    acceptedMint = await createMint(provider);

    // find event account PDA
    [eventPublicKey] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event", "utf-8"), provider.wallet.publicKey.toBuffer()],
      program.programId
    );

    // find event mint account PDA
    [eventMint] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("event_mint", "utf-8"), eventPublicKey.toBuffer()],
      program.programId
    );

    // find treasury vault account PDA
    [treasuryVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("treasury_vault", "utf-8"), eventPublicKey.toBuffer()],
      program.programId
    );

    // find gain vault account PDA
    [gainVault] = anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("gain_vault", "utf-8"), eventPublicKey.toBuffer()],
      program.programId
    );

    // creates a new wallet funded with 30 SOL 
    alice = await createFundedWallet(provider, 30);
    // create alice accepted mint ata with 10 accepted mint
    // Accepted mint = USDC  -> alice wallet = 100 USDC 
    aliceAcceptedMintATA = await createAssociatedTokenAccount(provider, acceptedMint, 100, alice);
    aliceEventMintATA = await getAssociatedTokenAddress(eventMint, alice.publicKey);

    // find provided (event organizer) wallet acceptend mint ata
    // only the address
    walletAcceptedMintATA = await getAssociatedTokenAddress(acceptedMint, provider.wallet.publicKey);

    // creates a new wallet funded  
    bob = await createFundedWallet(provider);
    // create bob accepted mint ata 
    bobAcceptedMintATA = await createAssociatedTokenAccount(provider, acceptedMint, 50, bob);
    bobEventMintATA = await getAssociatedTokenAddress(eventMint, bob.publicKey);
  });

  // TEST: Create an Event
  it("Creates a new Event", async () => {
    const name: string = "my_event";
    const ticketPrice = new BN(2);

    const tx = await program.methods.createEvent(name, ticketPrice)
      .accounts({
        event: eventPublicKey,
        acceptedMint: acceptedMint,//example:USDC
        eventMint: eventMint, //sponsorship token
        treasuryVault: treasuryVault,
        gainVault: gainVault,
        authority: provider.wallet.publicKey,
      })
      .rpc();

    // show new event info
    const eventAccount = await program.account.event.fetch(eventPublicKey);
    console.log("Event info: ", eventAccount);
  });

  // TEST: Sponsor event
  it("Alice Should get 5 event tokens", async () => {
    // show alice accepted mint (USDC) ATA info
    // should have 100 USDC
    let aliceUSDCBalance = await getAccount(
      provider.connection,
      aliceAcceptedMintATA // Alice Accepted mint account (USDC account)
    );
    // console.log("Alice Accepted mint ATA: ", aliceUSDCBalance);
    console.log("Alice USDC amount before: ", aliceUSDCBalance.amount);
    assert.equal(
      aliceUSDCBalance.amount.toString(), "100", `Expected Alice´s USDC balance before is 100, but got ${aliceUSDCBalance.amount.toString()}`
    );

    const quantity = new BN(5); // 5 USDC 
    await program.methods
      .sponsorEvent(quantity)
      .accounts({
        eventMint: eventMint, // 1:1 with USDC
        payerAcceptedMintAta: aliceAcceptedMintATA, // Alice USDC Account 
        event: eventPublicKey,
        authority: alice.publicKey,
        payerEventMintAta: aliceEventMintATA, // Alice Event Mint Account
        treasuryVault: treasuryVault // store all Accepted mint (USDC) from sponsorships
      })
      .signers([alice])
      .rpc();

    // show alice event mint ATA info
    // should have 5 sponsorship tokens
    const aliceAccount = await getAccount(
      provider.connection,
      aliceEventMintATA // Alice Event Mint account (should have <quantity> tokens from sponsorship)
    );
    // console.log("Alice Event mint ATA: ", aliceAccount);
    console.log("Alice sponsorship tokens: ", aliceAccount.amount);
    assert.equal(
      aliceAccount.amount.toString(), "5", `Expected Alice´s sponsorship token balance is 5, but got ${aliceAccount.amount.toString()}`
    );

    // show alice accepted mint (USDC) ATA info
    // should have 95 (100-5) USDC
    aliceUSDCBalance = await getAccount(
      provider.connection,
      aliceAcceptedMintATA // Alice Accepted mint account (USDC account)
    );
    // console.log("Alice Accepted mint ATA: ", aliceUSDCBalance);
    console.log("Alice USDC amount after: ", aliceUSDCBalance.amount);
    assert.equal(
      aliceUSDCBalance.amount.toString(), "95", `Expected Alice´s USDC balance before is 95, but got ${aliceUSDCBalance.amount.toString()}`
    );
  });

  // TEST: Sponsor event
  it("Bob Should get 15 event tokens", async () => {
    let bobUSDCBalance = await getAccount(
      provider.connection,
      bobAcceptedMintATA // Bob Accepted mint account (USDC account)
    );
    console.log("Bob USDC amount before: ", bobUSDCBalance.amount);
    assert.equal(
      bobUSDCBalance.amount.toString(), "50", `Expected Bob´s balance is 50, but got ${bobUSDCBalance.amount.toString()}`
    );

    const quantity = new BN(15);
    await program.methods
      .sponsorEvent(quantity)
      .accounts({
        eventMint: eventMint,
        payerAcceptedMintAta: bobAcceptedMintATA,
        event: eventPublicKey,
        authority: bob.publicKey,
        payerEventMintAta: bobEventMintATA,
        treasuryVault: treasuryVault
      })
      .signers([bob])
      .rpc();

    // show bob event mint ATA info
    const bobAccount = await getAccount(
      provider.connection,
      bobEventMintATA
    );
    console.log("Bob sponsorship tokens: ", bobAccount.amount);
    assert.equal(
      bobAccount.amount.toString(), "15", `Expected Bob´s sponsorship tokens balance is 15, but got ${bobAccount.amount.toString()}`
    );
  });
  // TEST: Buy 2 Tickets
  it("Alice buy 4 tickets", async () => {
    // show alice accepted mint (USDC) ATA info
    // should have 95 USDC
    let aliceUSDCBalance = await getAccount(
      provider.connection,
      aliceAcceptedMintATA // Alice Accepted mint account (USDC account)
    );
    // console.log("Alice Accepted mint ATA: ", aliceUSDCBalance);
    console.log("Alice USDC amount before: ", aliceUSDCBalance.amount);
    assert.equal(
      aliceUSDCBalance.amount.toString(), "95", `Expected Alice´s balance before is 95, but got ${aliceUSDCBalance.amount.toString()}`
    );

    const quantity = new BN(4); // 2 tickets
    await program.methods
      .buyTickets(quantity)
      .accounts({
        payerAcceptedMintAta: aliceAcceptedMintATA, // Alice Accepted mint (USDC) account
        event: eventPublicKey,
        authority: alice.publicKey,
        gainVault: gainVault // stores all accepted mint (USDC) from tickets purchase
      })
      .signers([alice])
      .rpc();

    // show event gain vault info
    // should have 4 USDC ( 2 tickets x 2 USDC (tickect_price))
    const gainVaultAccount = await getAccount(
      provider.connection,
      gainVault // stores all accepted mint (USDC) from tickets purchase
    );
    console.log("Event gain vault total: ", gainVaultAccount.amount);
    assert.equal(
      gainVaultAccount.amount.toString(), "8", `Expected gainVaultAccount´s balance is 8, but got ${gainVaultAccount.amount.toString()}`
    );

    // show alice accepted mint (USDC) ATA info
    // shoul have 91 (95-4) USDC
    aliceUSDCBalance = await getAccount(
      provider.connection,
      aliceAcceptedMintATA // Alice Accepted mint account (USDC account)
    );
    // console.log("Alice Accepted mint ATA: ", aliceUSDCBalance);
    console.log("Alice USDC amount after: ", aliceUSDCBalance.amount);
    assert.equal(
      aliceUSDCBalance.amount.toString(), "87", `Expected ALice´s balance after is 87, but got ${aliceUSDCBalance.amount.toString()}`
    );

  });

  // TEST: Buy 16 Tickets
  it("Bob buy 16 tickets", async () => {
    let bobUSDCBalance = await getAccount(
      provider.connection,
      bobAcceptedMintATA // Bob Accepted mint account (USDC account)
    );
    console.log("Bob USDC amount before: ", bobUSDCBalance.amount);
    assert.equal(
      bobUSDCBalance.amount.toString(), "35", `Expected Bob´s balance is 35, but got ${bobUSDCBalance.amount.toString()}`
    );
    const quantity = new BN(16);
    await program.methods
      .buyTickets(quantity)
      .accounts({
        payerAcceptedMintAta: bobAcceptedMintATA,
        event: eventPublicKey,
        authority: bob.publicKey,
        gainVault: gainVault
      })
      .signers([bob])
      .rpc();

    // show event gain vault info
    const gainVaultAccount = await getAccount(
      provider.connection,
      gainVault
    );
    console.log("Event gain vault amount: ", gainVaultAccount.amount);
    assert.equal(
      gainVaultAccount.amount.toString(), "40", `Expected Bob´s balance is 40, but got ${gainVaultAccount.amount.toString()}`
    );
    // show bob accepted mint (USDC) ATA info
    // should have 3 (35-16x2) USDC
    bobUSDCBalance = await getAccount(
      provider.connection,
      bobAcceptedMintATA // Bob Accepted mint account (USDC account)
    );
    console.log("Bob USDC amount after: ", bobUSDCBalance.amount);
    assert.equal(
      bobUSDCBalance.amount.toString(), "3", `Expected Bob´s balance is 3, but got ${bobUSDCBalance.amount.toString()}`
    );
  });

  // TEST: Withdraw Funds
  it("Event organizer should withdraw 1 from treasury", async () => {
    // show event treasury vault info
    // should have 5 USDC
    let treasuryVaultAccount = await getAccount(
      provider.connection,
      treasuryVault
    );
    console.log("Event treasury vault total before: ", treasuryVaultAccount.amount);
    assert.equal(
      treasuryVaultAccount.amount.toString(), "20", `Expected treasuryVaul's balance before is 20, but got ${treasuryVaultAccount.amount.toString()}`
    );

    const amount = new BN(1); // 1 USDC
    await program.methods
      .withdrawFunds(amount)
      .accounts({
        event: eventPublicKey,
        acceptedMint: acceptedMint, // example: USDC
        authority: provider.wallet.publicKey, // event organizer
        treasuryVault: treasuryVault, // stores all Accepted Mint (USDC) from sponsorships
        authotiryAcceptedMintAta: walletAcceptedMintATA, // account where the event organizer receives accepted mint(USDC)
      })
      .rpc();

    // show event treasury vault info
    // should have 4 (5-1) USDC
    treasuryVaultAccount = await getAccount(
      provider.connection,
      treasuryVault
    );
    console.log("Event treasury vault total after: ", treasuryVaultAccount.amount);
    assert.equal(
      treasuryVaultAccount.amount.toString(), "19", `Expected treasuryVaul's balance after is 19, but got ${treasuryVaultAccount.amount.toString()}`
    );
    // show event organizer accepted mint (USDC) ATA info
    // should have 1 accepted mint (USDC) 
    const organizerUSDCBalance = await getAccount(
      provider.connection,
      walletAcceptedMintATA // event organizer Accepted mint account (USDC account)
    );
    console.log("Organizer USDC amount: ", organizerUSDCBalance.amount);
    assert.equal(
      organizerUSDCBalance.amount.toString(), "1", `Expected organizer USDC amount is 1, but got ${organizerUSDCBalance.amount.toString()}`
    );

  });
  // TEST: The Event is close
  it("Event organizer should close the event", async () => {

    // const amount = new BN(1); // 1 USDC
    await program.methods
      .closeEvent()
      .accounts({
        event: eventPublicKey,
        authority: provider.wallet.publicKey, // event organizer
      })
      .rpc();

    // show a new event info
    const eventAccount = await program.account.event.fetch(eventPublicKey);

    console.log("The event is active?: ", eventAccount.active);

  });
  // TEST: Can´t buy more tickets
  it("Alice can´t buy more tickets", async () => {

    const amount = new BN(3);
    let error: anchor.AnchorError;
    try {

      await program.methods
        .buyTickets(amount)
        .accounts({
          payerAcceptedMintAta: aliceAcceptedMintATA,
          event: eventPublicKey,
          authority: alice.publicKey,
          gainVault: gainVault
        })
        .signers([alice])
        .rpc();
    } catch (err) {
      error = err;
    }

    // show the error buying info
    assert.equal(error.error.errorCode.code, "EventClosed");
    console.log("Can´t buy more tickets, the event is closed");

  });

  // TEST: Withdraw earnings
  it("Alice Should withdraw earnings", async () => {

    // show total sponsorships
    const eventAccount = await program.account.event.fetch(eventPublicKey);
    console.log("Event total sponsorships: ", eventAccount.sponsors.toNumber());

    let bobUSDCBalance = await getAccount(
      provider.connection,
      bobAcceptedMintATA // Bob Accepted mint account (USDC account)
    );

    // show event gain vault amount
    let gainVaultAccount = await getAccount(
      provider.connection,
      gainVault
    );
    console.log("Event gain vault amount: ", gainVaultAccount.amount);
    assert.equal(gainVaultAccount.amount.toString(), "40", `Expected gainVaultAccount's balance is 40, but got ${gainVaultAccount.amount.toString()}`);

    // show Alice sponsorship tokens
    let aliceTokens = await getAccount(
      provider.connection,
      aliceEventMintATA
    );
    console.log("Alice sponsorship tokens: ", aliceTokens.amount);
    assert.equal(aliceTokens.amount.toString(), "5", `Expected Alice's sponsorship tokens balance is 5, but got ${aliceTokens.amount.toString()}`);

    await program.methods
      .withdrawEarnings()
      .accounts({
        userEventMintAta: aliceEventMintATA,
        event: eventPublicKey,
        authority: alice.publicKey,
        gainVault: gainVault,
        userAcceptedMintAta: aliceAcceptedMintATA,
        eventMint: eventMint
      })
      .signers([alice])
      .rpc();

    // show event gain vault amount
    gainVaultAccount = await getAccount(
      provider.connection,
      gainVault
    );
    console.log("Event gain vault amount: ", gainVaultAccount.amount);
    assert.equal(gainVaultAccount.amount.toString(), "30", `Expected gainVaultAccount's balance is 30, but got ${gainVaultAccount.amount.toString()}`);
  });

});