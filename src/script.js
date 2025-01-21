import { getDeployerAddresses } from "./getDeployerAddresses";

document.getElementById("searchButton").addEventListener("click", searchTokens);
document.getElementById("stopButton").addEventListener("click", stopSearch);

const API_KEY = 'RUmrjZDO6MFnezWq8ZTt7gOiVj1NVlp5ZfQhRMff';
const BASE_URL = 'https://public-api.dextools.io/trial';
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/';
const API_RATE_LIMIT = 1000;

let searchInProgress = false;
let shouldStop = false;

// Configuration de moment.js en français
moment.locale('fr');

function formatNumber(num) {
    const value = Number(num);

    if (value === null || isNaN(value) || value === undefined) return '0';

    // Pour les très petites valeurs
    if (Math.abs(value) < 0.01) {
        const str = value.toString();
        if (str.includes('e-')) {
            const [base, exponent] = str.split('e-');
            const zeroCount = parseInt(exponent) - 1;
            const baseNumber = parseFloat(base).toFixed(4);
            return `$0.0${zeroCount}${baseNumber}`;
        }
    }

    // Pour les autres valeurs
    if (value < 1000) {
        return '$' + value.toFixed(4);
    }

    return '$' + new Intl.NumberFormat('fr-FR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4
    }).format(value);
}

function formatLiquidityFriendly(num) {
    // Conversion explicite en nombre
    const value = Number(num);

    if (value === null || isNaN(value) || value === undefined) return '0$';

    // Pour les valeurs très proches de zéro (inférieures à 0.01$)
    if (Math.abs(value) < 0.01) {
        return '~0$';
    }

    // Pour les valeurs entre 0.01$ et 999.99$
    if (value < 1000) {
        return value.toFixed(2) + '$';
    }

    // Pour les valeurs entre 1K$ et 999.9K$
    if (value < 1000000) {
        return (value / 1000).toFixed(1) + 'K$';
    }

    // Pour les valeurs de 1M$ et plus
    return (value / 1000000).toFixed(1) + 'M$';
}

function formatTimeAgo(date) {
    const now = moment();
    const creationTime = moment(date);
    const duration = moment.duration(now.diff(creationTime));

    if (duration.asMinutes() < 60) {
        return `créé il y a ${Math.round(duration.asMinutes())} minutes`;
    } else if (duration.asHours() < 24) {
        return `créé il y a ${Math.round(duration.asHours())} heures`;
    } else {
        return `créé il y a ${Math.round(duration.asDays())} jours`;
    }
}

function getLiquidityClass(liquidity) {
    const value = Number(liquidity);
    if (value >= 5) return 'liquidity-high';
    if (value >= 1) return 'liquidity-medium';
    return 'liquidity-low';
}

function log(message, isError = false) {
    const debugDiv = document.querySelector('.debug-info');
    debugDiv.style.display = 'block';
    const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
    const logMessage = `[${timestamp}] ${message}`;

    console.log(logMessage);
    debugDiv.innerHTML += logMessage + '\n';
    debugDiv.scrollTop = debugDiv.scrollHeight;

    if (isError) {
        console.error(message);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function makeApiCall(url) {
    const proxyUrl = CORS_PROXY + url;
    log(`Appel API vers : ${url}`);

    try {
        const response = await fetch(proxyUrl, {
            headers: {
                'X-API-KEY': API_KEY,
                'accept': 'application/json',
                'origin': window.location.origin
            }
        });

        log(`Statut de la réponse : ${response.status}`);

        if (!response.ok) {
            throw new Error(`Erreur HTTP! statut: ${response.status}`);
        }

        const text = await response.text();
        log(`Réponse brute : ${text.substring(0, 200)}...`);

        try {
            const data = JSON.parse(text);
            log(`Réponse parsée avec succès`);
            return data;
        } catch (e) {
            throw new Error(`Erreur de parsing JSON : ${e.message}`);
        }
    } catch (error) {
        log(`Erreur d'appel API : ${error.message}`, true);
        throw error;
    }
}

async function getTokenHolders(chain, address, retryCount = 0) {
    try {
        const data = await makeApiCall(`${BASE_URL}/v2/token/${chain}/${address}/info`);

        /*
        {
            "circulatingSupply": 0,
            "totalSupply": 0,
            "mcap": 0,
            "fdv": 0,
            "holders": 0,
            "transactions": 0
        }
        */
        const holders = data?.data?.holders;

        log(`Holders trouvés pour ${address}: ${holders}`);

        if (holders === undefined || holders === null) {
            throw new Error('Données de holders non trouvées');
        }

        return holders;
    } catch (error) {
        log(`Erreur lors de la récupération des holders (tentative ${retryCount + 1}): ${error.message}`);

        if (retryCount < 2) {
            log(`Nouvelle tentative dans ${API_RATE_LIMIT}ms...`);
            await sleep(API_RATE_LIMIT);
            return getTokenHolders(chain, address, retryCount + 1);
        }

        log('Échec de la récupération des holders après plusieurs tentatives');
        return null;
    }
}

async function getLiquidity(poolAddress, retryCount = 0) {
    log(`Récupération de la liquidité pour le pool : ${poolAddress} (tentative ${retryCount + 1})`);
    try {
        const data = await makeApiCall(`${BASE_URL}/v2/pool/ether/${poolAddress}/liquidity`);
        /*
        {
            "reserves": {
                "mainToken": 0,
                "sideToken": 0
            },
            "liquidity": 0
        }
        */
        log(`Données de liquidité reçues : ${JSON.stringify(data)}`);
        return data?.data?.liquidity || 0;
    } catch (error) {
        if (retryCount < 2) {
            log(`Nouvelle tentative après erreur : ${error.message}`);
            await sleep(API_RATE_LIMIT);
            return getLiquidity(poolAddress, retryCount + 1);
        }
        throw error;
    }
}

async function stopSearch() {
    if (searchInProgress) {
        shouldStop = true;
        log('Arrêt de la recherche demandé...');
        document.querySelector('.progress').textContent = 'Arrêt de la recherche...';
        document.querySelector('#stopButton').disabled = true;
    }
}
async function searchTokens() {
    console.log("Search Tokens");
    if (searchInProgress) {
        log('Recherche déjà en cours');
        return;
    }

    try {
        shouldStop = false;
        searchInProgress = true;

        const daysAgo = document.getElementById('days').value;
        const maxLiquidity = parseFloat(document.getElementById('liquidity').value);
        const resultsDiv = document.querySelector('.results');
        const loadingDiv = document.querySelector('.loading');
        const errorDiv = document.querySelector('.error');
        const debugDiv = document.querySelector('.debug-info');
        const progressDiv = document.querySelector('.progress');
        const searchButton = document.querySelector('#searchButton');
        const stopButton = document.querySelector('#stopButton');

        // Réinitialiser l'affichage
        resultsDiv.innerHTML = '';
        loadingDiv.style.display = 'block';
        errorDiv.style.display = 'none';
        debugDiv.style.display = 'block';
        debugDiv.innerHTML = '';
        progressDiv.style.display = 'block';
        searchButton.disabled = true;
        stopButton.disabled = false;
        stopButton.style.display = 'inline-block';

        log('Démarrage de la recherche...');
        log(`Paramètres : jours=${daysAgo}, liquiditéMax=${maxLiquidity}`);

        const fromDate = moment().subtract(daysAgo, 'days').toISOString();
        const toDate = moment().toISOString();
        log(`Plage de dates : ${fromDate} à ${toDate}`);

        const url = `${BASE_URL}/v2/pool/ether?sort=creationTime&order=desc&from=${fromDate}&to=${toDate}&page=0&pageSize=50`;
        /*
        {
            "totalPages": 0,
            "page": 0,
            "pageSize": 0,
            "results": [
                "https://apiable.s3.eu-central-1.amazonaws.com/public/dextools/41a92397-5c85-47cd-a2f7-e1f4f5c827a3.json#/components/schemas/PoolListDescription"
            ]
        }
        */
        const data = await makeApiCall(url);
        await sleep(API_RATE_LIMIT);

        if (!data.data || !data.data.results) {
            throw new Error('Format de réponse API invalide');
        }

        log(`${data.data.results.length} pools trouvés à traiter`);

        const totalPools = data.data.results.length;
        let processedPools = 0;
        let matchingPools = 0;

        for (let i = 0; i < data.data.results.length; i++) {
            if (shouldStop) {
                log('Recherche arrêtée par l\'utilisateur');
                break;
            }

            const pool = data.data.results[i];
            const estimatedTimeRemaining = (totalPools - i) * (API_RATE_LIMIT / 1000);
            progressDiv.textContent = `Traitement du pool ${i + 1}/${totalPools}... Temps restant estimé : ${estimatedTimeRemaining} secondes`;

            if (pool && pool.address) {
                try {
                    const liquidity = await getLiquidity(pool.address);
                    const holders = await getTokenHolders('ether', pool.mainToken?.address);

                    const deployers = await getDeployerAddresses(pool.address); // [0x0xBDf8ab3Ab62DDBd9aE12Aae034B99ff042788845 || null, 0xBDf8ab3Ab62DDBd9aE12Aae034B99ff042788845 || null]

                    processedPools++;
                    log(`Pool ${pool.mainToken?.symbol || 'Inconnu'} liquidité: $${liquidity}`);

                    if (Number(liquidity) <= maxLiquidity) {
                        matchingPools++;
                        log(`Pool trouvé : ${pool.mainToken?.symbol} avec liquidité $${liquidity}`);

                        const tokenCard = document.createElement('div');
                        tokenCard.className = 'token-card';
                        const dextoolsUrl = `https://www.dextools.io/app/en/ether/pair-explorer/${pool.address}`;

                        const holdersDisplay = holders !== null ?
                            `<span class="holders-badge">${holders.toLocaleString()} holders</span>` :
                            '';

                        const formattedLiquidity = formatNumber(liquidity);

                        tokenCard.innerHTML = `
                            <div class="time-badge">${formatTimeAgo(pool.creationTime)}</div>
                            <div class="token-header">
                                <h3 class="token-name">
                                    ${pool.mainToken?.name || 'Inconnu'} (${pool.mainToken?.symbol || 'Inconnu'})
                                    ${holdersDisplay}
                                </h3>
                                <div class="token-links">
                                    <a href="${dextoolsUrl}" target="_blank" class="token-link">Voir sur DexTools</a>
                                </div>
                            </div>
                            <div class="token-info">
                                <div class="info-item">
                                    <div class="info-label">Liquidité</div>
                                    <div class="info-value ${getLiquidityClass(liquidity)} liquidity-value" 
                                         data-full-value="${formattedLiquidity}">
                                        ${formatLiquidityFriendly(liquidity)}
                                    </div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Exchange</div>
                                    <div class="info-value">${pool.exchangeName || 'N/A'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Paire</div>
                                    <div class="info-value">${pool.mainToken?.symbol || 'Inconnu'} / ${pool.sideToken?.symbol || 'Inconnu'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Date de création</div>
                                    <div class="info-value">${moment(pool.creationTime).format('DD/MM/YYYY HH:mm:ss')}</div>
                                </div>
                            </div>
                            <div class="token-info" style="margin-top: 15px;">
                                <div class="info-item">
                                    <div class="info-label">Adresse du Token</div>
                                    <div class="info-value address">${pool.mainToken?.address || 'N/A'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Adresse du Pool</div>
                                    <div class="info-value address">${pool.address || 'N/A'}</div>
                                </div>
                            </div>
                            <div class="transaction-info" style="margin-top: 15px;">
                                <div class="info-item">
                                    <div class="info-label">Wallet First Transaction</div>
                                    <div class="info-value address">${deployers[0] || 'N/A'}</div>
                                </div>
                                <div class="info-item">
                                    <div class="info-label">Wallet Next Transaction</div>
                                    <div class="info-value address">${deployers[1] || 'N/A'}</div>
                                </div>
                            </div>
                        `;
                        resultsDiv.appendChild(tokenCard);
                    }

                    await sleep(API_RATE_LIMIT);
                } catch (error) {
                    log(`Erreur lors du traitement du pool ${pool.address}: ${error.message}`, true);
                    await sleep(API_RATE_LIMIT);
                    continue;
                }
            }
        }

        loadingDiv.style.display = 'none';
        stopButton.style.display = 'none';
        searchButton.disabled = false;

        const processedMessage = shouldStop ?
            `Recherche arrêtée. ${processedPools} pools traités sur ${totalPools}.` :
            `Recherche terminée. ${processedPools} pools traités, ${matchingPools} pools correspondants trouvés.`;

        log(processedMessage);
        progressDiv.textContent = processedMessage;

        if (matchingPools === 0) {
            resultsDiv.innerHTML = '<p>Aucun token trouvé correspondant à vos critères.</p>';
        }

    } catch (error) {
        loadingDiv.style.display = 'none';
        stopButton.style.display = 'none';
        searchButton.disabled = false;
        errorDiv.style.display = 'block';
        errorDiv.textContent = 'Erreur : ' + error.message;
        log(`Erreur rencontrée : ${error.message}`, true);
        console.error('Erreur de recherche :', error);
    } finally {
        searchInProgress = false;
        shouldStop = false;
    }
}