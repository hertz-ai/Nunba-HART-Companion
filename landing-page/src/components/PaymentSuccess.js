import React, {useEffect, useState} from 'react';
import './PaymentSuccess.css';
import {Link} from 'react-router-dom';
import {Button} from 'reactstrap';

import {logger} from '../utils/logger';

const PaymentSuccess = () => {
  const [plan_name, setPlan_name] = useState();
  const [status, setStaus] = useState();
  const [transaction_id, setTransaction_id] = useState();

  const [hevolvedroid, setIshevolvedroid] = useState(false);
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    logger.log(urlParams);
    const transaction_id = urlParams.get('transaction_id');
    const status = urlParams.get('status');
    const plan_name = urlParams.get('plan_name');
    logger.log(transaction_id, status, plan_name, 'hello first msg');

    setTransaction_id(transaction_id || '');
    setStaus(status || '');
    setPlan_name(plan_name || '');

    const userAgent = navigator.userAgent;
    setIshevolvedroid(userAgent.includes('hevolvedroid'));
  }, [transaction_id, status, plan_name]);

  useEffect(() => {
    var myVariable = {
      HEVOLVEAIPLUS_PLAN_NAME: plan_name,
      PAYMENT_STATUS: status,
      TRANSACTION_ID: transaction_id,
    };
    const jsTransaction = JSON.stringify(myVariable);
    window.Handy.setPaymentStatus(jsTransaction);
    // logger.log('Setting payment status:', jsTransaction);
    if (hevolvedroid) {
      var myVariable = {
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
    <div className="payment-success-container">
      <div className="success-container">
        <div className="success-icon">&#10004;</div>
      </div>
      <h2>Payment Successful!</h2>
      <p className="transaction-id">Transaction ID: {transaction_id}</p>
      <p className="thank-you">Thank you </p>

      <Button>
        {' '}
        <Link to="/">Go To Homepage</Link>
      </Button>
    </div>
  );
};

export default PaymentSuccess;
