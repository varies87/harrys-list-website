import dynamic from "next/dynamic";
import Head from "next/head";

const AdminApp = dynamic(() => import("../AdminApp"), { ssr: false });

export default function AdminPage() {
  return (
    <>
      <Head>
        <title>Admin — Harry's List</title>
        <meta name="robots" content="noindex" />
      </Head>
      <AdminApp />
    </>
  );
}
