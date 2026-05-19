import { useSelector } from 'react-redux';

const useUser = () => useSelector((state: any) => state.auth?.authData?.data?.user);

function App() {
  const user = useUser();

  return (
    <>
      <h1>Hello{user ? `, ${user.firstName} ${user.lastName}` : ''}!</h1>
      <p>14:29</p>
    </>
  );
}

export default App;
