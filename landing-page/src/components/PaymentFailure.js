import {logger} from '../utils/logger';

import React, {useEffect, useState} from 'react';

const PaymentFailure = () => {
  const [plan_name, setPlan_name] = useState();
  const [status, setStaus] = useState();
  const [transaction_id, setTransaction_id] = useState();

  const [hevolvedroid, setIshevolvedroid] = useState(false);
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const transaction_id = urlParams.get('transaction_id');
    const status = urlParams.get('status');
    const plan_name = urlParams.get('plan_name');

    setTransaction_id(transaction_id || '');
    setStaus(status || '');
    setPlan_name(plan_name || '');

    const userAgent = navigator.userAgent;
    setIshevolvedroid(userAgent.includes('hevolvedroid'));
  }, []);

  useEffect(() => {
    if (hevolvedroid) {
      const myVariable = {
        HEVOLVEAIPLUS_PLAN_NAME: plan_name,
        PAYMENT_STATUS: status,
        TRANSACTION_ID: transaction_id,
      };
      const jsTransaction = JSON.stringify(myVariable);
      window.Handy.setPaymentStatus(jsTransaction);
      // logger.log('Setting payment status:', jsTransaction);
    }
  }, [hevolvedroid, plan_name, status, transaction_id]);

  // logger.log(plan_name, status, transaction_id);
  return (
    <div>
      <h2>Payment Failed!</h2>
      <p>Your transaction ID: {transaction_id}</p>
    </div>
  );
};

export default PaymentFailure;
