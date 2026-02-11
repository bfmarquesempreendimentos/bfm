// Simulador Interativo - Estilo Jogo de Futebol

const totalSteps = 4;
let currentStep = 1;
let simuladorData = {
    renda: 0,
    valorImovel: 0
};

// Inicializar simulador
document.addEventListener('DOMContentLoaded', function() {
    updateStepDisplay();
    updatePlayerPosition();
    positionBallAtDefender();
});

// Avançar etapa
function avancarEtapa() {
    if (currentStep < totalSteps) {
        // Validar etapa atual antes de avançar
        if (!validateCurrentStep()) {
            return;
        }
        
        // Salvar dados da etapa atual
        saveCurrentStepData();
        
        currentStep++;
        updateStepDisplay();
        updatePlayerPosition();
        animateBallMovement();
    }
}

// Voltar etapa
function voltarEtapa() {
    if (currentStep > 1) {
        currentStep--;
        updateStepDisplay();
        updatePlayerPosition();
    }
}

// Validar etapa atual
function validateCurrentStep() {
    let isValid = true;
    let message = '';
    
    switch(currentStep) {
        case 1:
            const renda = parseFloat(document.getElementById('step1Renda').value);
            if (!renda || renda <= 0) {
                isValid = false;
                message = 'Por favor, informe sua renda familiar.';
            }
            break;
        case 2:
            const valor = parseFloat(document.getElementById('step2Valor').value);
            if (!valor || valor <= 0) {
                isValid = false;
                message = 'Por favor, informe o valor do imóvel.';
            }
            break;
    }
    
    if (!isValid) {
        showMessage(message, 'error');
    }
    
    return isValid;
}

// Salvar dados da etapa atual
function saveCurrentStepData() {
    switch(currentStep) {
        case 1:
            simuladorData.renda = parseFloat(document.getElementById('step1Renda').value) || 0;
            break;
        case 2:
            simuladorData.valorImovel = parseFloat(document.getElementById('step2Valor').value) || 0;
            break;
    }
}

// Atualizar exibição das etapas
function updateStepDisplay() {
    // Atualizar classes das etapas
    document.querySelectorAll('.step').forEach((step, index) => {
        const stepNum = index + 1;
        if (stepNum < currentStep) {
            step.classList.add('completed');
            step.classList.remove('active');
        } else if (stepNum === currentStep) {
            step.classList.add('active');
            step.classList.remove('completed');
        } else {
            step.classList.remove('active', 'completed');
        }
    });
    
    // Atualizar botões
    const btnAvancar = document.getElementById('btnAvancar');
    const btnVoltar = document.getElementById('btnVoltar');
    const btnReiniciar = document.getElementById('btnReiniciar');
    
    if (currentStep === totalSteps) {
        btnAvancar.style.display = 'none';
        btnReiniciar.style.display = 'inline-block';
    } else {
        btnAvancar.style.display = 'inline-block';
        btnReiniciar.style.display = 'none';
    }
    
    if (currentStep > 1) {
        btnVoltar.style.display = 'inline-block';
    } else {
        btnVoltar.style.display = 'none';
    }

    syncBallWithStep();
}

// Atualizar posição do jogador no campo
function updatePlayerPosition() {
    const player = document.getElementById('player');
    const field = document.querySelector('.game-field');
    if (player && player.classList.contains('player-attacker')) {
        return;
    }
    const fieldWidth = field.offsetWidth;
    
    // Calcular posição baseada na etapa (0% a 100%)
    const progress = (currentStep / totalSteps) * 100;
    const playerPosition = (progress / 100) * (fieldWidth - 60); // 60px é a largura do jogador
    
    player.style.left = playerPosition + 'px';
    player.style.transition = 'left 0.5s ease-in-out';
}

function positionBallAtDefender() {
    const ball = document.getElementById('ball');
    const field = document.querySelector('.game-field');
    const defender = document.querySelector('.npc-player.player-def');
    if (!ball || !field || !defender) return;
    const fieldRect = field.getBoundingClientRect();
    const ballSize = ball.offsetWidth || 30;
    const defRect = defender.getBoundingClientRect();
    const pos = {
        x: defRect.left - fieldRect.left + defRect.width / 2 - ballSize / 2,
        y: defRect.top - fieldRect.top + defRect.height / 2 - ballSize / 2
    };
    ball.style.transition = 'left 0.3s ease, top 0.3s ease';
    ball.style.left = `${pos.x}px`;
    ball.style.top = `${pos.y}px`;
    ball.style.bottom = 'auto';
    ball.classList.remove('ball-kick');
}

function syncBallWithStep() {
    const ball = document.getElementById('ball');
    const field = document.querySelector('.game-field');
    const defender = document.querySelector('.npc-player.player-def');
    const mid = document.querySelector('.npc-player.player-mid');
    const attacker = document.getElementById('player');
    const goal = document.querySelector('.goal-right');
    if (!ball || !field || !defender || !mid || !attacker || !goal) return;

    const fieldRect = field.getBoundingClientRect();
    const ballSize = ball.offsetWidth || 30;
    const getCenter = (el) => {
        const rect = el.getBoundingClientRect();
        return {
            x: rect.left - fieldRect.left + rect.width / 2 - ballSize / 2,
            y: rect.top - fieldRect.top + rect.height / 2 - ballSize / 2
        };
    };

    const positions = {
        1: getCenter(defender),
        2: getCenter(mid),
        3: getCenter(attacker),
        4: {
            x: field.offsetWidth - 70,
            y: field.offsetHeight / 2 - ballSize / 2
        }
    };

    const target = positions[currentStep] || positions[1];
    ball.classList.remove('ball-kick');
    ball.style.transition = 'left 0.45s ease, top 0.45s ease';
    ball.style.left = `${target.x}px`;
    ball.style.top = `${target.y}px`;
    ball.style.bottom = 'auto';

    if (currentStep === totalSteps) {
        const goal = document.querySelector('.goal-right');
        goal.classList.add('goal-hit');
        setTimeout(() => goal.classList.remove('goal-hit'), 600);
    }
}

// Animar movimento da bola
function animateBallMovement() {
    const ball = document.getElementById('ball');
    const player = document.getElementById('player');
    const field = document.querySelector('.game-field');
    const defender = document.querySelector('.npc-player.player-def');
    const mid = document.querySelector('.npc-player.player-mid');
    const goal = document.querySelector('.goal-right');
    
    // Sincronizar bola com a etapa
    ball.classList.remove('ball-kick');
    ball.style.transform = 'translate(0, 0)';
    syncBallWithStep();
    
    // Animação de chute quando chegar no gol
    if (currentStep === totalSteps) {
        if (field && defender && mid && goal && player) {
            const fieldRect = field.getBoundingClientRect();
            const ballSize = ball.offsetWidth || 30;
            const getCenter = (el) => {
                const rect = el.getBoundingClientRect();
                return {
                    x: rect.left - fieldRect.left + rect.width / 2 - ballSize / 2,
                    y: rect.top - fieldRect.top + rect.height / 2 - ballSize / 2
                };
            };
            const defenderPos = getCenter(defender);
            const midPos = getCenter(mid);
            const attackerPos = getCenter(player);
            const goalPos = {
                x: field.offsetWidth - 70,
                y: field.offsetHeight / 2 - ballSize / 2
            };

            const moveBall = (pos, duration = 500, callback) => {
                ball.style.transition = `left ${duration}ms ease, top ${duration}ms ease`;
                ball.style.left = `${pos.x}px`;
                ball.style.top = `${pos.y}px`;
                ball.style.bottom = 'auto';
                if (callback) {
                    setTimeout(callback, duration + 50);
                }
            };

            moveBall(defenderPos, 300, () => {
                moveBall(midPos, 450, () => {
                    moveBall(attackerPos, 450, () => {
                        moveBall(goalPos, 650, () => {
                            goal.classList.add('goal-hit');
                            setTimeout(() => goal.classList.remove('goal-hit'), 600);
                            showGoalAnimation();
                        });
                    });
                });
            });
            return;
        }
        setTimeout(() => {
            ball.classList.add('ball-kick');
            ball.addEventListener('animationend', () => {
                showGoalAnimation();
            }, { once: true });
        }, 500);
    } else {
        syncBallWithStep();
    }
}

// Mostrar animação de gol
function showGoalAnimation() {
    const field = document.querySelector('.game-field');
    const goalAnimation = document.createElement('div');
    goalAnimation.className = 'goal-animation';
    goalAnimation.innerHTML = `
        <div class="goal-text">
            <h2>⚽ GOL! 🎉</h2>
            <p>Você completou a simulação!</p>
        </div>
    `;
    
    field.appendChild(goalAnimation);
    
    setTimeout(() => {
        goalAnimation.remove();
        finalizarSimulacao();
    }, 3000);
}

// Revisar dados
function revisarDados() {
    const revisaoHTML = `
        <div class="revisao-dados">
            <h4>Revisão dos Dados Informados</h4>
            <div class="revisao-item">
                <span>Renda Familiar:</span>
                <strong>R$ ${simuladorData.renda.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
            </div>
            <div class="revisao-item">
                <span>Valor do Imóvel:</span>
                <strong>R$ ${simuladorData.valorImovel.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
            </div>
            <button class="btn btn-primary" onclick="currentStep = 1; updateStepDisplay(); updatePlayerPosition();">Editar Dados</button>
        </div>
    `;
    
    const step3 = document.querySelector('.step[data-step="3"] .step-content');
    step3.innerHTML = revisaoHTML;
}

// Finalizar simulação
function finalizarSimulacao() {
    // Calcular resultado final
    const subsidioLimitado = 55000;
    const valorFinanciado = Math.max(0, simuladorData.valorImovel - subsidioLimitado);
    const valorTotalFinanciado = valorFinanciado + subsidioLimitado;
    const taxaMensal = Math.pow(1 + 6.5 / 100, 1/12) - 1;
    const prazoMeses = 360;
    
    const amortizacao = valorFinanciado / prazoMeses;
    const primeiraPrestacao = amortizacao + (valorFinanciado * taxaMensal);
    const ultimaPrestacao = amortizacao;
    const prestacaoMedia = (primeiraPrestacao + ultimaPrestacao) / 2;
    
    const rendaMaximaPrestacao = simuladorData.renda * 0.30;
    const aprovado = prestacaoMedia <= rendaMaximaPrestacao;
    
    const whatsappLink = getWhatsAppLink(
        `Olá, finalizei o simulador. Minha renda é R$ ${simuladorData.renda.toLocaleString('pt-BR')} e o imóvel custa R$ ${simuladorData.valorImovel.toLocaleString('pt-BR')}.`
    );
    
    const resultadoHTML = `
        <div class="resultado-simulacao ${aprovado ? 'aprovado' : 'reprovado'}">
            <h3>${aprovado ? '✅ Financiamento Aprovado!' : '❌ Financiamento Precisa de Ajustes'}</h3>
            <div class="resultado-detalhes">
                <div class="detalhe-item">
                    <span>Subsídio:</span>
                    <strong>R$ 55.000,00</strong>
                </div>
                <div class="detalhe-item">
                    <span>Total Financiado (imóvel + subsídio):</span>
                    <strong>R$ ${valorTotalFinanciado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                </div>
                <div class="detalhe-item">
                    <span>Valor do Imóvel:</span>
                    <strong>R$ ${simuladorData.valorImovel.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                </div>
                <div class="detalhe-item">
                    <span>Valor Financiado:</span>
                    <strong>R$ ${valorFinanciado.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                </div>
                <div class="detalhe-item">
                    <span>Prestação Média:</span>
                    <strong>R$ ${prestacaoMedia.toLocaleString('pt-BR', {minimumFractionDigits: 2})}</strong>
                </div>
                <div class="detalhe-item">
                    <span>Prazo:</span>
                    <strong>30 anos (${prazoMeses} meses)</strong>
                </div>
            </div>
            ${!aprovado ? `
                <div class="alerta">
                    <p>A prestação média excede 30% da sua renda. Considere ajustar os valores.</p>
                </div>
            ` : ''}
            ${whatsappLink ? `
                <div class="resultado-cta">
                    <a href="${whatsappLink}" class="btn btn-primary" target="_blank" rel="noopener">
                        Falar no WhatsApp
                    </a>
                </div>
            ` : ''}
        </div>
    `;
    
    document.getElementById('resultadoFinal').innerHTML = resultadoHTML;
    document.getElementById('gameResult').style.display = 'block';
    showResultOverlay();
}

// Reiniciar simulador
function reiniciarSimulador() {
    currentStep = 1;
    simuladorData = {
        renda: 0,
        valorImovel: 0
    };
    
    // Limpar campos
    document.getElementById('step1Renda').value = '';
    document.getElementById('step2Valor').value = '';
    
    // Restaurar conteúdo da etapa 3
    const step3 = document.querySelector('.step[data-step="3"] .step-content');
    step3.innerHTML = '<h4>Revisão</h4><button class="btn btn-secondary" onclick="revisarDados()">Revisar Dados</button>';
    
    // Esconder resultado
    document.getElementById('gameResult').style.display = 'none';
    const overlay = document.querySelector('.result-overlay');
    if (overlay) overlay.remove();
    
    updateStepDisplay();
    updatePlayerPosition();
    
    const ball = document.getElementById('ball');
    ball.style.left = '10px';
    ball.style.transform = 'translate(0, 0)';
    ball.classList.remove('ball-kick');
    ball.style.bottom = '35px';
    ball.style.top = 'auto';
    positionBallAtDefender();
}

function showResultOverlay() {
    const resultadoFinal = document.getElementById('resultadoFinal');
    if (!resultadoFinal || !resultadoFinal.innerHTML.trim()) return;
    let overlay = document.querySelector('.result-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'result-overlay';
        overlay.innerHTML = `
            <div class="result-overlay-content">
                <button class="result-overlay-close" aria-label="Fechar">×</button>
                <div class="result-overlay-body"></div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('.result-overlay-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) overlay.remove();
        });
    }
    overlay.querySelector('.result-overlay-body').innerHTML = resultadoFinal.innerHTML;
    overlay.style.display = 'flex';
}

function getWhatsAppLink(message) {
    if (typeof CONFIG === 'undefined') return '';
    const broker = typeof isBroker === 'function' && isBroker() ? (currentUser?.phone || '') : '';
    const raw = broker || CONFIG.company.whatsappSales || '';
    const digits = raw.replace(/\D/g, '');
    if (!digits) return '';
    return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

