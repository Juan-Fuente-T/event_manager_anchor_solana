use { anchor_lang::prelude::*, crate::instructions::*} ;

mod collections;
mod instructions;

declare_id!("Cu1WSoc3P34R1KjKzLpF46V1uF5b8eWyqrAvEKU6mqWd");

#[program]
pub mod event_manager {
    use super::*;
    pub fn create_event(
        ctx: Context<CreateEvent>,
        name: String,
        ticket_price: u64,
    ) -> Result<()> {
        instructions::create_event::handle(ctx, name, ticket_price)
    }

     // sponsor event (get event mint tokens)
     pub fn sponsor_event (
        ctx: Context<Sponsor>,
        quantity: u64,
    ) -> Result<()> {
        instructions::sponsor::handle(ctx, quantity)
    }

    // buy tickets
    pub fn buy_tickets (
        ctx: Context<BuyTickets>,
        quantity: u64,
    ) -> Result<()> {
        instructions::buy_tickets::handle(ctx, quantity)
    }

     // withdraw funds
     pub fn withdraw_funds(
        ctx: Context<WithdrawFunds>,
        amount: u64,
    ) -> Result<()> {
        instructions::withdraw_funds::handle(ctx, amount)
    }
}