(function (L) {
  'use strict';
  // Built-in sample material. Plainly labelled as a sample in the UI; it goes through the
  // same registrar pipeline as anything the student uploads.
  L.SAMPLE = {
    name: 'Introduction to Probability — lecture notes (sample)',
    text: `# Introduction to Probability

These notes cover the first six lectures of a one-term introduction to probability. They assume comfort with algebra and summation notation, and nothing else.

## 1. Sample spaces and events

An experiment is any process whose outcome is uncertain: tossing a coin, drawing a card, measuring tomorrow's temperature. The sample space, written S, is the set of all possible outcomes. For one toss of a coin, S = {H, T}. For two tosses, S = {HH, HT, TH, TT}. For the number of emails you receive tomorrow, S = {0, 1, 2, ...}, which is infinite but countable. For a temperature reading, S is an interval of real numbers and is uncountable.

An event is a subset of the sample space. "At least one head in two tosses" is the event A = {HH, HT, TH}. Because events are sets, the language of sets is the language of events. The union A ∪ B is the event that A or B occurs (or both). The intersection A ∩ B is the event that both occur. The complement A^c is the event that A does not occur. Two events are mutually exclusive, or disjoint, if A ∩ B is empty: they cannot both happen.

De Morgan's laws carry over directly. (A ∪ B)^c = A^c ∩ B^c says that "neither A nor B" is the same as "not A and not B". Drawing a Venn diagram is a reliable way to check any claim about three or fewer events.

## 2. The axioms of probability

A probability is a function P that assigns a number to every event and satisfies three axioms. First, P(A) ≥ 0 for every event A. Second, P(S) = 1: something in the sample space must happen. Third, if A1, A2, ... are pairwise disjoint events, then P(A1 ∪ A2 ∪ ...) = P(A1) + P(A2) + .... This third axiom is called countable additivity and it is the one that does all the work.

Several useful facts follow from the axioms alone. The complement rule: P(A^c) = 1 − P(A). The probability of the empty event is 0. If A is a subset of B then P(A) ≤ P(B). The inclusion–exclusion formula for two events: P(A ∪ B) = P(A) + P(B) − P(A ∩ B). The subtraction corrects for the outcomes counted twice, once in A and once in B. For three events the formula adds the three pairwise intersections back in and subtracts the triple intersection.

When the sample space is finite and every outcome is equally likely, probability reduces to counting: P(A) = |A| / |S|. This is the classical definition, and it is why the first weeks of any probability course lean on combinatorics. The number of ways to choose k objects from n without regard to order is the binomial coefficient C(n, k) = n! / (k!(n − k)!). The probability that a five-card poker hand is a flush, for example, is 4 × C(13, 5) / C(52, 5), which is roughly 0.00198.

## 3. Conditional probability and independence

The conditional probability of A given B, written P(A | B), is the probability of A when we know that B has occurred. It is defined, for P(B) > 0, by P(A | B) = P(A ∩ B) / P(B). Conditioning shrinks the sample space to B and rescales so that the probabilities inside B sum to one.

Rearranging the definition gives the multiplication rule: P(A ∩ B) = P(B) P(A | B). Applied repeatedly it gives the chain rule for several events, which is how one computes the probability of drawing three aces in a row without replacement: (4/52)(3/51)(2/50).

Two events are independent if P(A ∩ B) = P(A) P(B), or equivalently P(A | B) = P(A) when P(B) > 0. Independence means that learning B tells you nothing about A. It is a modelling assumption, not something you can read off a Venn diagram, and it is easy to get wrong: disjoint events with positive probability are never independent, because if one occurs the other cannot. A collection of events is mutually independent if the product rule holds for every sub-collection, which is stronger than pairwise independence.

The law of total probability lets us compute an unconditional probability by conditioning on a partition. If B1, ..., Bn are disjoint events whose union is S, then P(A) = Σ P(A | Bi) P(Bi). In words: average the conditional probabilities of A, weighting each by how likely its condition is.

## 4. Bayes' theorem

Bayes' theorem reverses the direction of conditioning. From the multiplication rule written both ways, P(A ∩ B) = P(B | A) P(A) = P(A | B) P(B), so P(A | B) = P(B | A) P(A) / P(B). The denominator is usually expanded with the law of total probability.

The standard example is a diagnostic test. Suppose a disease has prevalence 1% and a test has sensitivity 99% (it detects the disease when present) and specificity 95% (it is negative when the disease is absent). A person tests positive. The probability they have the disease is P(D | +) = (0.99 × 0.01) / (0.99 × 0.01 + 0.05 × 0.99) = 0.0099 / 0.0594, which is about 0.167. Despite an accurate test, five in six positives are false positives, because the disease is rare. This phenomenon is called the base-rate fallacy when people ignore the prevalence.

The terms have names. P(A) is the prior, P(A | B) is the posterior, P(B | A) is the likelihood, and P(B) is the evidence or marginal likelihood. Bayes' theorem says: posterior is proportional to likelihood times prior. This one line is the foundation of Bayesian statistics.

## 5. Random variables and expectation

A random variable is a function from the sample space to the real numbers. It turns outcomes into numbers so that we can do arithmetic with them. The number of heads in three tosses is a random variable X taking values in {0, 1, 2, 3}. A random variable is discrete if it takes countably many values and continuous if it takes values in an interval.

A discrete random variable is described by its probability mass function p(x) = P(X = x), which is non-negative and sums to one over all x. The cumulative distribution function F(x) = P(X ≤ x) is defined for every random variable, discrete or continuous, and is non-decreasing from 0 to 1.

The expectation, or mean, of a discrete random variable is E[X] = Σ x p(x): a weighted average of the values, weighted by their probabilities. Expectation is linear: E[aX + bY] = aE[X] + bE[Y] for any constants a and b, whether or not X and Y are independent. Linearity is the most useful single fact in the course; it lets you compute the expected number of matches, fixed points, or successes by adding indicator variables without ever finding the full distribution.

The variance measures spread: Var(X) = E[(X − μ)²] = E[X²] − μ², where μ = E[X]. Its square root is the standard deviation, which has the same units as X. Variance is not linear: Var(aX) = a² Var(X), and Var(X + Y) = Var(X) + Var(Y) only when X and Y are uncorrelated, which is implied by independence.

## 6. Common discrete distributions

The Bernoulli distribution describes a single trial with success probability p: P(X = 1) = p, P(X = 0) = 1 − p, mean p, variance p(1 − p).

The binomial distribution counts successes in n independent Bernoulli trials with the same p. Its mass function is P(X = k) = C(n, k) p^k (1 − p)^(n − k) for k = 0, ..., n, with mean np and variance np(1 − p). Both moments follow from linearity: a binomial is a sum of n Bernoullis.

The geometric distribution counts the number of trials up to and including the first success: P(X = k) = (1 − p)^(k−1) p for k = 1, 2, .... Its mean is 1/p. The geometric distribution is memoryless: given that no success has occurred in the first m trials, the remaining wait has the same distribution as the original wait.

The Poisson distribution with rate λ has P(X = k) = e^(−λ) λ^k / k! for k = 0, 1, 2, .... Its mean and variance are both λ. It arises as the limit of a binomial with n large and p small while np = λ stays fixed, which is why it models counts of rare events in a fixed interval: typos on a page, calls arriving in a minute, radioactive decays in a second.

Choosing the right distribution is a matter of matching the story. Fixed number of trials and a count of successes: binomial. Waiting for the first success: geometric. Counting rare events at a steady rate: Poisson. Learning to recognise these stories is the main skill assessed in the first examination.
`
  };
})(window.L);
