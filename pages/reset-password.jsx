import dynamic from "next/dynamic";
import Head from "next/head";

const ResetPassword = dynamic(() => import("../CustomerApp").then((mod) => mod.ResetPassword), { ssr: false });

export default function ResetPasswordPage() {
  return (
    <>
      <Head>
        <title>Reset Password — Harry's List</title>
        <meta name="robots" content="noindex" />
      </Head>
      <ResetPassword />
    </>
  );
}
