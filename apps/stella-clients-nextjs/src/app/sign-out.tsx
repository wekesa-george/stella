'use client';

type Props = {
  onSignOut: () => Promise<void>;
};

const SignOut = ({ onSignOut }: Props) => {
  return (
    <button
      onClick={() => {
        onSignOut();
      }}
      className="px-4 py-2 rounded-md border border-border/40 text-foreground text-sm font-medium hover:bg-muted transition-colors"
    >
      Sign Out
    </button>
  );
};

export default SignOut;
