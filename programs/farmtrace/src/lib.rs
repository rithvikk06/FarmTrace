use anchor_lang::prelude::*;

declare_id!("EPmeYZtFMyJKrXXwiFpNkKmcPqdyk1Cbppw5wQqiVYEa");

#[program]
pub mod farmtrace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
