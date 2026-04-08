'use client';

type Props = {
  onSignIn: () => Promise<void>;
};

const SignIn = ({ onSignIn }: Props) => {
  return (
    <button
      onClick={() => {
        onSignIn();
      }}
      className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
    >
      Sign In
    </button>
  );
};

export default SignIn;
